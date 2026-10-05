import 'server-only';
import type { ResultadoDoCargo } from '@/lib/domain/apuracao';
import { CARGOS_DA_APURACAO, urlDaFoto } from '@/lib/domain/tse-ao-vivo';
import { selectRows } from '@/lib/supabase/rest';
import { configuracaoAoVivo } from './votacao-ao-vivo.service';

/**
 * Foto oficial do candidato, buscada no TSE pelo servidor.
 *
 * Passa pelo servidor (e nao direto do navegador ao TSE) porque o TSE pode
 * recusar acesso de fora. Nulo quando o cargo nao tem foto na apuracao ou o
 * TSE nao respondeu: quem chama mostra as iniciais.
 */
export async function fotoDoCandidato(cargo: number, sqcand: string): Promise<{ corpo: ArrayBuffer; tipo: string } | null> {
  const info = CARGOS_DA_APURACAO.find((x) => x.codigo === cargo);
  if (!info || !/^[0-9]{1,20}$/.test(sqcand)) return null;
  const c = configuracaoAoVivo();
  const resposta = await fetch(urlDaFoto(c, c.uf, info.federal, sqcand), {
    signal: AbortSignal.timeout(10_000),
    cache: 'force-cache',
  }).catch(() => null);
  if (!resposta?.ok) return null;
  return { corpo: await resposta.arrayBuffer(), tipo: resposta.headers.get('content-type') ?? 'image/jpeg' };
}

/**
 * O sequencial do TSE (sqcand) de um candidato pelo numero de urna, lido do
 * resultado da apuracao que a coleta ao vivo ja gravou (migration 058). O
 * mapa conhece o candidato pelo numero; a foto, so pelo sequencial.
 */
export async function sqcandPeloNumero(cargo: number, numero: string, ano?: number): Promise<string | null> {
  if (!/^[0-9]{1,6}$/.test(numero)) return null;
  const c = configuracaoAoVivo();
  // Votacao de outro ano (planilha de 2022, por exemplo): o mesmo numero e
  // outra pessoa. Sem foto, em vez da foto errada.
  if (ano !== undefined && ano !== c.ano) return null;
  const [linha] = await selectRows<{ payload: ResultadoDoCargo }>('cmd_tse_live_results', {
    select: 'payload',
    filters: { pleito: `eq.${c.pleito}`, uf: `eq.${c.uf}`, office_code: `eq.${cargo}` },
    limit: 1,
  }).catch(() => []);
  return linha?.payload.candidatos.find((x) => x.numero === numero)?.sqcand ?? null;
}

/** A resposta HTTP da foto, com cache de um dia no navegador: a foto nao muda na eleicao. */
export function respostaDaFoto(foto: { corpo: ArrayBuffer; tipo: string }): Response {
  return new Response(foto.corpo, {
    headers: { 'Content-Type': foto.tipo, 'Cache-Control': 'private, max-age=86400' },
  });
}
