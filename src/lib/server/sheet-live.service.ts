import 'server-only';
import type { Member } from '@/lib/types';
import {
  chaveDoNome,
  enderecoLimpo,
  idDaPlanilha,
  lerAbaDoSheets,
  planejarPlanilha,
  type AbaLida,
  type PessoaDaAba,
  type RelatorioDaPlanilha,
} from '@/lib/domain/planilha-do-sheets';
import { ENDERECO_FIXO, verificadoPorFotoParaGravar } from '@/lib/domain/csv-import';
import { tierOf } from '@/lib/domain/team-tier';
import { TABLES, type ClientRow, type MemberRow, type UserRow } from '@/lib/supabase/tables';
import { inFilter, selectOne, selectRows, SupabaseRequestError, updateRows } from '@/lib/supabase/rest';
import { lerXlsx, PlanilhaInvalidaError } from './xlsx';
import { badRequest, notFound } from './http';

/**
 * Planilha do Google Sheets do time DUPLICADO, lida AO VIVO (migration 052).
 *
 * NADA DA PLANILHA E GRAVADO NO BANCO. O banco guarda so o interruptor e o
 * link. Cada vez que a lista do time e pedida, a planilha e lida do Google e
 * a Equipe de cada Lider e montada NA MEMORIA, como pessoas "da planilha":
 * aparecem na lista, no painel do Lider e no relatorio, e nao existem em
 * tabela nenhuma. Quem atualiza a planilha ve a mudanca no sistema sem
 * importar nada.
 *
 * Para nao ir ao Google a cada clique, a leitura fica guardada na memoria do
 * servidor por ate UM MINUTO (`LEITURA_VALE_MS`). "Ler agora" ignora essa
 * guarda e le na hora.
 *
 * Cada aba e um Lider. O Lider que a planilha "cria" (aba sem Lider com
 * aquele nome no time) tambem so existe na tela.
 */

/** Por quanto tempo uma leitura da planilha e reaproveitada. */
export const LEITURA_VALE_MS = 60_000;
/** Tamanho maximo do arquivo baixado. Uma planilha de mutirao fica muito abaixo. */
const LIMITE_DO_ARQUIVO = 25 * 1024 * 1024;

const COMPARTILHAR =
  'Confira se a planilha está compartilhada como "Qualquer pessoa com o link" (Leitor) no Google Sheets.';

/** Prefixo dos identificadores do que so existe na tela. Nunca e um id do banco. */
export const PREFIXO_DA_PLANILHA = 'planilha-';

type ClienteDaPlanilha = Pick<
  ClientRow,
  'id' | 'is_copy' | 'sheet_sync_enabled' | 'sheet_url' | 'state_uf' | 'cities'
>;

interface Leitura {
  em: string;
  abas: AbaLida[];
}

/* -------------------------------------------------------------------------
   Leitura do Google, com a guarda de um minuto
   ------------------------------------------------------------------------- */

const guardadas = new Map<string, { quando: number; leitura: Leitura }>();
const emAndamento = new Map<string, Promise<Leitura>>();

async function baixar(id: string): Promise<Buffer> {
  // O endereco e MONTADO aqui, a partir do id: o servidor so baixa do
  // Google, nunca de um endereco que veio pronto do navegador.
  let resposta: Response;
  try {
    resposta = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`, {
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw badRequest('Não consegui falar com o Google Sheets agora. Tente de novo em instantes.');
  }

  if (!resposta.ok) throw badRequest(`Não consegui abrir a planilha. ${COMPARTILHAR}`);
  // Planilha fechada: o Google responde com a pagina de login, e nao com o
  // arquivo.
  if ((resposta.headers.get('content-type') ?? '').includes('text/html')) {
    throw badRequest(`A planilha não está aberta para leitura. ${COMPARTILHAR}`);
  }

  const dados = Buffer.from(await resposta.arrayBuffer());
  if (dados.length > LIMITE_DO_ARQUIVO) throw badRequest('A planilha é grande demais para ler.');
  return dados;
}

async function lerDoGoogle(id: string): Promise<Leitura> {
  const dados = await baixar(id);
  let abas;
  try {
    abas = lerXlsx(dados);
  } catch (error) {
    if (error instanceof PlanilhaInvalidaError) throw badRequest(`${error.message} ${COMPARTILHAR}`);
    throw error;
  }
  return {
    em: new Date().toISOString(),
    abas: abas.map((aba) => lerAbaDoSheets(aba.titulo, aba.linhas)),
  };
}

/** A planilha, do Google ou da guarda de um minuto. */
export async function lerPlanilha(url: string, opcoes: { naHora?: boolean } = {}): Promise<Leitura> {
  const id = idDaPlanilha(url);
  if (!id) throw badRequest('Link da planilha inválido.');

  const guardada = guardadas.get(id);
  if (!opcoes.naHora && guardada && Date.now() - guardada.quando < LEITURA_VALE_MS) {
    return guardada.leitura;
  }

  // Duas telas pedindo ao mesmo tempo: uma ida ao Google so.
  const andamento = emAndamento.get(id);
  if (andamento) return andamento;

  const promessa = lerDoGoogle(id)
    .then((leitura) => {
      guardadas.set(id, { quando: Date.now(), leitura });
      return leitura;
    })
    .finally(() => emAndamento.delete(id));
  emAndamento.set(id, promessa);
  return promessa;
}

/** Esquece a leitura guardada (link trocado, planilha desligada). */
function esquecer(url: string | null | undefined): void {
  const id = url ? idDaPlanilha(url) : null;
  if (id) guardadas.delete(id);
}

/* -------------------------------------------------------------------------
   Configuracao
   ------------------------------------------------------------------------- */

async function configuracao(clientId: string): Promise<ClienteDaPlanilha | null> {
  try {
    return await selectOne<ClienteDaPlanilha>(TABLES.clients, {
      select: 'id,is_copy,sheet_sync_enabled,sheet_url,state_uf,cities',
      filters: { id: `eq.${clientId}` },
    });
  } catch (error) {
    if (error instanceof SupabaseRequestError && error.isMissingSchema) return null;
    throw error;
  }
}

async function requireCopy(clientId: string): Promise<ClienteDaPlanilha> {
  const row = await configuracao(clientId);
  if (row === null) {
    // Ou o time nao existe, ou o banco ainda nao tem a migration.
    const existe = await selectOne<Pick<ClientRow, 'id'>>(TABLES.clients, {
      select: 'id',
      filters: { id: `eq.${clientId}` },
    });
    if (!existe) throw notFound('Time não encontrado.');
    throw badRequest(
      'Para usar a planilha do Google Sheets, execute antes a migration 052_planilha_do_sheets.sql no Supabase.',
    );
  }
  // A barreira que importa: a planilha so existe no time duplicado.
  if (!row.is_copy) throw badRequest('A planilha do Google Sheets é só para time duplicado.');
  return row;
}

/** Liga, desliga e troca o link. So o endereco e guardado. */
export async function updateSheetSettings(
  clientId: string,
  input: { enabled: boolean; url: string },
): Promise<void> {
  const atual = await requireCopy(clientId);

  const texto = input.url.trim();
  const id = texto ? idDaPlanilha(texto) : null;
  if (texto && !id) {
    throw badRequest(
      'Link inválido. Cole o endereço da planilha, como https://docs.google.com/spreadsheets/d/…',
    );
  }
  if (input.enabled && !id) throw badRequest('Cole o link da planilha antes de ligar.');

  await updateRows<ClientRow>(
    TABLES.clients,
    { id: `eq.${clientId}` },
    { sheet_sync_enabled: input.enabled, sheet_url: id ? enderecoLimpo(id) : null },
    'id',
  );
  esquecer(atual.sheet_url);
}

/* -------------------------------------------------------------------------
   A Equipe montada na memoria
   ------------------------------------------------------------------------- */

/** Um Lider do time, como a planilha precisa dele. */
export interface LiderVivo {
  memberId: string;
  name: string;
  userId: string | null;
  tag: string | null;
}

export interface EquipeDaPlanilha {
  /** Pessoas (e Lideres novos) que so existem na tela. */
  membros: Member[];
  /**
   * Lider do banco sem usuario (sem telefone) -> identificador de tela que
   * a Equipe dele usa para apontar para ele.
   */
  vinculoDoLider: Map<string, string>;
  relatorio: RelatorioDaPlanilha;
  /**
   * UF do time: e com ela que a zona + secao da planilha acham a escola no
   * mapa (numero de zona se repete entre estados). Nao vai para a pessoa.
   */
  estado: string;
}

function pessoaNaTela(
  pessoa: PessoaDaAba,
  id: string,
  base: { clientId: string; estado: string; cidade: string; em: string },
  lider: { vinculo: string; name: string; tag: string | null },
): Member {
  return {
    id,
    clientId: base.clientId,
    name: pessoa.name,
    phone: pessoa.phone,
    email: null,
    photo: null,
    gender: null,
    cpf: null,
    voterId: pessoa.voterId || null,
    zone: pessoa.zone || null,
    section: pessoa.section || null,
    // Literal: a planilha nao tem endereco, entao a pessoa tambem nao tem.
    // Nada de preencher com o municipio do time — seria dado inventado.
    state: null,
    city: null,
    district: null,
    street: null,
    relationshipOptionId: null,
    relationshipLabel: null,
    responses: [],
    consentAt: null,
    source: 'admin',
    recruitedBy: {
      userId: lider.vinculo,
      name: lider.name,
      role: 'EQUIPE',
      tier: 'LIDER',
      tag: lider.tag,
      photo: null,
    },
    tier: 'EQUIPE',
    tag: null,
    photoVerified: verificadoPorFotoParaGravar(pessoa.photoVerified),
    reference: pessoa.reference || null,
    fromSheet: true,
    recruiterChange: null,
    access: 'PENDING',
    userId: null,
    createdAt: base.em,
    updatedAt: base.em,
  };
}

/**
 * A Equipe da planilha, pronta para a tela. Funcao pura: recebe a leitura e
 * os Lideres do time, e nao fala com banco nem com o Google.
 */
export function montarEquipe(
  leitura: Leitura,
  lideres: LiderVivo[],
  base: { clientId: string; estado: string; cidade: string },
): EquipeDaPlanilha {
  const plano = planejarPlanilha(leitura.abas, lideres);
  const porMembro = new Map(lideres.map((lider) => [lider.memberId, lider]));
  const contexto = { ...base, em: leitura.em };

  const membros: Member[] = [];
  const vinculoDoLider = new Map<string, string>();
  const lideresEncontrados: string[] = [];
  const lideresCriados: string[] = [];
  let pessoas = 0;

  for (const grupo of plano.grupos) {
    let vinculo: string;
    let tag: string | null = null;

    if (grupo.lider.tipo === 'existente') {
      const lider = porMembro.get(grupo.lider.memberId)!;
      lideresEncontrados.push(lider.name);
      tag = lider.tag;
      vinculo = lider.userId ?? `${PREFIXO_DA_PLANILHA}lider-${lider.memberId}`;
      if (!lider.userId) vinculoDoLider.set(lider.memberId, vinculo);
    } else {
      vinculo = `${PREFIXO_DA_PLANILHA}lider-${chaveDoNome(grupo.lider.name).replace(/ /g, '-')}`;
      lideresCriados.push(grupo.lider.name);
      membros.push({
        ...pessoaNaTela(
          { name: grupo.lider.name, phone: '', voterId: '', zone: '', section: '', reference: '', photoVerified: '' },
          vinculo,
          contexto,
          { vinculo, name: grupo.lider.name, tag: null },
        ),
        // O Lider novo foi "cadastrado" pela planilha, e e Lider.
        recruitedBy: { userId: null, name: 'Planilha do Google Sheets', role: 'ADMIN', photo: null },
        tier: 'LIDER',
        userId: vinculo,
      });
    }

    grupo.pessoas.forEach((pessoa, i) => {
      membros.push(pessoaNaTela(pessoa, `${vinculo}-${i}`, contexto, { vinculo, name: grupo.lider.name, tag }));
    });
    pessoas += grupo.pessoas.length;
  }

  return {
    membros,
    vinculoDoLider,
    estado: base.estado,
    relatorio: {
      ok: true,
      em: leitura.em,
      abas: leitura.abas.length,
      lideresEncontrados,
      lideresCriados,
      pessoas,
      abasIgnoradas: plano.abasIgnoradas,
      linhasIgnoradas: plano.linhasIgnoradas,
    },
  };
}

/** Os Lideres que estao no banco da copia, com o usuario de cada um. */
async function lideresDoBanco(clientId: string): Promise<LiderVivo[]> {
  const linhas = await selectRows<Pick<MemberRow, 'id' | 'name' | 'recruited_by_role' | 'tag'>>(
    TABLES.members,
    {
      select: 'id,name,recruited_by_role,tag',
      filters: { client_id: `eq.${clientId}` },
      order: 'created_at.asc',
    },
  );
  const lideres = linhas.filter((row) => tierOf(row.recruited_by_role) === 'LIDER');
  if (lideres.length === 0) return [];

  const usuarios = await selectRows<Pick<UserRow, 'id' | 'member_id'>>(TABLES.users, {
    select: 'id,member_id',
    filters: { member_id: inFilter(lideres.map((row) => row.id)) },
  });
  const usuarioDe = new Map(usuarios.map((row) => [row.member_id, row.id]));

  return lideres.map((row) => ({
    memberId: row.id,
    name: row.name,
    userId: usuarioDe.get(row.id) ?? null,
    tag: row.tag ?? null,
  }));
}

async function equipeDoTime(
  cliente: ClienteDaPlanilha,
  opcoes: { naHora?: boolean } = {},
): Promise<EquipeDaPlanilha> {
  const [leitura, lideres] = await Promise.all([
    lerPlanilha(cliente.sheet_url!, opcoes),
    lideresDoBanco(cliente.id),
  ]);
  return montarEquipe(leitura, lideres, {
    clientId: cliente.id,
    estado: cliente.state_uf ?? ENDERECO_FIXO.state,
    cidade: cliente.cities?.[0] ?? ENDERECO_FIXO.city,
  });
}

/**
 * A Equipe da planilha para a lista do time, ou `null` quando a planilha
 * nao esta ligada (ou o time nao e copia).
 *
 * Falha ao ler o Google NAO derruba a pagina do time: a lista vem sem a
 * Equipe da planilha, e o cartão da planilha mostra o motivo.
 */
export async function equipeDaPlanilha(clientId: string): Promise<EquipeDaPlanilha | null> {
  const cliente = await configuracao(clientId);
  if (!cliente?.is_copy || !cliente.sheet_sync_enabled || !cliente.sheet_url) return null;

  try {
    return await equipeDoTime(cliente);
  } catch (error) {
    console.warn('[planilha] Não foi possível ler a planilha do time', clientId, error);
    return {
      membros: [],
      vinculoDoLider: new Map(),
      estado: cliente.state_uf ?? ENDERECO_FIXO.state,
      relatorio: {
        ok: false,
        em: new Date().toISOString(),
        erro: error instanceof Error ? error.message : 'Não foi possível ler a planilha.',
        abas: 0,
        lideresEncontrados: [],
        lideresCriados: [],
        pessoas: 0,
        abasIgnoradas: [],
        linhasIgnoradas: 0,
      },
    };
  }
}

/** O que o cartão da planilha mostra. `naHora` ignora a guarda de um minuto. */
export async function statusDaPlanilha(
  clientId: string,
  opcoes: { naHora?: boolean } = {},
): Promise<RelatorioDaPlanilha> {
  const cliente = await requireCopy(clientId);
  if (!cliente.sheet_sync_enabled || !cliente.sheet_url) {
    throw badRequest('Ligue a planilha e cole o link antes de ler.');
  }
  try {
    return (await equipeDoTime(cliente, opcoes)).relatorio;
  } catch (error) {
    return {
      ok: false,
      em: new Date().toISOString(),
      erro: error instanceof Error ? error.message : 'Não foi possível ler a planilha.',
      abas: 0,
      lideresEncontrados: [],
      lideresCriados: [],
      pessoas: 0,
      abasIgnoradas: [],
      linhasIgnoradas: 0,
    };
  }
}
