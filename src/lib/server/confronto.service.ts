import 'server-only';
import type { EnvioParaASala, EscolaNaSala, RecorteDaSala, ResumoDaEscolaNaSala } from '@/lib/domain/sala-de-confronto';
import type { CandidatoDaVotacao } from '@/lib/domain/votacao-tse';
import type { SessionUser } from '@/lib/types';
import { deleteRows, selectOne, selectRows, updateRows, upsertRows } from '@/lib/supabase/rest';
import { TABLES } from '@/lib/supabase/tables';
import { forbidden, notFound } from './http';

/**
 * Sala de Confronto (migration 060): as escolas que o time mandou para o
 * duelo, com os candidatos de cada lado, os Lideres selecionados e o
 * recorte do mapa no envio.
 *
 * O RECORTE DE ACESSO e o mesmo do mapa: o ADMIN ve todos os times (e o
 * mapa geral, `scope` vazio); o Administrador do time ve SEMPRE o proprio —
 * imposto aqui, pela sessao. Trocar o `clientId` do pedido nao alcanca
 * outro time.
 */

const TABELA = 'cmd_confrontation_schools';

interface LinhaDaSala {
  id: string;
  scope: string;
  scope_name: string | null;
  school_key: string;
  title: string;
  address: string | null;
  city: string | null;
  uf: string | null;
  campaign_pins: string[];
  left_candidates: CandidatoDaVotacao[];
  right_candidates: CandidatoDaVotacao[];
  leaders: { id: string; nome: string }[];
  recorte: RecorteDaSala;
  snapshot: Partial<ResumoDaEscolaNaSala>;
  sent_by_name: string | null;
  created_at: string;
  updated_at: string;
}

const COLUNAS =
  'id,scope,scope_name,school_key,title,address,city,uf,campaign_pins,left_candidates,right_candidates,leaders,recorte,snapshot,sent_by_name,created_at,updated_at';

function montar(l: LinhaDaSala): EscolaNaSala {
  return {
    id: l.id,
    scope: l.scope,
    scopeName: l.scope_name,
    chave: l.school_key,
    titulo: l.title,
    endereco: l.address,
    cidade: l.city,
    uf: l.uf,
    pinos: l.campaign_pins ?? [],
    esquerda: l.left_candidates ?? [],
    direita: l.right_candidates ?? [],
    lideres: l.leaders ?? [],
    recorte: l.recorte ?? {},
    resumo: l.snapshot ?? {},
    enviadoPor: l.sent_by_name,
    enviadoEm: l.created_at,
    atualizadoEm: l.updated_at,
  };
}

/**
 * O time de quem pede. ADMIN: o pedido (vazio = mapa geral). Fora do ADMIN,
 * sempre o time da sessao.
 */
export function escopoDe(user: SessionUser, pedido: string | null | undefined): string {
  if (user.role === 'ADMIN') return pedido ?? '';
  if (!user.candidateId) throw forbidden();
  return user.candidateId;
}

/** As escolas da sala. ADMIN sem time pedido: todas, de todos os times. */
export async function escolasDaSala(user: SessionUser, pedido: string | null | undefined): Promise<EscolaNaSala[]> {
  const todas = user.role === 'ADMIN' && pedido === undefined;
  const linhas = await selectRows<LinhaDaSala>(TABELA, {
    select: COLUNAS,
    filters: todas ? {} : { scope: `eq.${escopoDe(user, pedido)}` },
    order: 'updated_at.desc',
    limit: 500,
  });
  return linhas.map(montar);
}

async function nomeDoEscopo(scope: string): Promise<string> {
  if (!scope) return 'Mapa geral';
  const time = await selectOne<{ name: string }>(TABLES.clients, { select: 'name', filters: { id: `eq.${scope}` } }).catch(() => null);
  return time?.name ?? 'Time';
}

/** Envia (ou reenvia) a escola. Reenviar atualiza no lugar e mantem os adversarios ja chamados. */
export async function enviarParaASala(user: SessionUser, envio: EnvioParaASala): Promise<EscolaNaSala> {
  const scope = escopoDe(user, envio.clientId ?? '');
  const agora = new Date().toISOString();
  await upsertRows(
    TABELA,
    [
      {
        scope,
        scope_name: await nomeDoEscopo(scope),
        school_key: envio.chave,
        title: envio.titulo,
        address: envio.endereco,
        city: envio.cidade,
        uf: envio.uf,
        campaign_pins: envio.pinos,
        left_candidates: envio.esquerda,
        leaders: envio.lideres,
        recorte: envio.recorte,
        snapshot: { ...envio.resumo, em: agora },
        sent_by: user.id,
        sent_by_name: user.name,
        updated_at: agora,
      },
    ],
    'scope,school_key',
  );
  const linha = await selectOne<LinhaDaSala>(TABELA, {
    select: COLUNAS,
    filters: { scope: `eq.${scope}`, school_key: `eq.${envio.chave}` },
  });
  if (!linha) throw notFound('A escola não foi gravada na sala.');
  return montar(linha);
}

/** Filtro da linha pedida, ja com o time da sessao fora do ADMIN. */
function filtroDaLinha(user: SessionUser, id: string): Record<string, string> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Esta escola não está mais na sala.');
  const filtros: Record<string, string> = { id: `eq.${id}` };
  if (user.role !== 'ADMIN') filtros.scope = `eq.${escopoDe(user, null)}`;
  return filtros;
}

/** Atualiza os adversarios, os Lideres selecionados ou o placar da ultima leitura. */
export async function atualizarNaSala(
  user: SessionUser,
  id: string,
  mudanca: { direita?: CandidatoDaVotacao[]; lideres?: { id: string; nome: string }[]; resumo?: Partial<ResumoDaEscolaNaSala> },
): Promise<EscolaNaSala> {
  const valores: Record<string, object | string> = {};
  if (mudanca.direita) valores.right_candidates = mudanca.direita;
  if (mudanca.lideres) valores.leaders = mudanca.lideres;
  if (mudanca.resumo) valores.snapshot = { ...mudanca.resumo, em: new Date().toISOString() };
  // O placar recalculado nao conta como mexida na sala: so o resto sobe a escola na lista.
  if (mudanca.direita || mudanca.lideres) valores.updated_at = new Date().toISOString();
  const [linha] = await updateRows<LinhaDaSala>(TABELA, filtroDaLinha(user, id), valores, COLUNAS);
  if (!linha) throw notFound('Esta escola não está mais na sala.');
  return montar(linha);
}

export async function tirarDaSala(user: SessionUser, id: string): Promise<void> {
  const apagadas = await deleteRows(TABELA, filtroDaLinha(user, id));
  if (apagadas.length === 0) throw notFound('Esta escola não está mais na sala.');
}
