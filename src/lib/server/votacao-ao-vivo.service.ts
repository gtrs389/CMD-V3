import 'server-only';
import { BoletimIlegivel, comparecimentoDoBoletim, lerBoletimDeUrna, votosDoBoletim } from '@/lib/domain/boletim-de-urna';
import {
  APURACAO_2026_1T,
  CARGOS_DA_APURACAO,
  boletimDoAuxiliar,
  nomesDoCargo,
  secoesDaLista,
  urlDaListaDeSecoes,
  urlDoAuxiliar,
  urlDoBoletim,
  urlDosCandidatos,
  type ConfiguracaoDaApuracao,
  type SecaoDaApuracao,
} from '@/lib/domain/tse-ao-vivo';
import { callFunction, selectOne, selectRows, updateRows, upsertRows } from '@/lib/supabase/rest';

/**
 * Votacao AO VIVO: os boletins de urna do TSE, buscados durante a apuracao
 * (migration 055).
 *
 * Cada chamada e uma COLETA curta: pega a trava (uma coleta por vez em todo
 * o sistema), verifica algumas centenas de secoes que ainda nao tinham
 * boletim, baixa os que chegaram, e consolida em cmd_election_votes — a
 * tabela que o mapa ja le. Quem chama e o proprio mapa, a cada minuto,
 * enquanto alguem olha a votacao; e, se configurado, um agendador externo.
 *
 * CUIDADO COM O TSE. O TSE bloqueia por cerca de 10 minutos quem faz
 * requisicoes demais ou acumula 404. Por isso: no maximo 3 requisicoes
 * simultaneas, um intervalo minimo entre elas, a secao sem boletim so e
 * consultada de novo depois de alguns minutos, e uma sequencia de 403/429
 * pausa a coleta inteira por 11 minutos.
 */

const TABELA_SECOES = 'cmd_tse_live_sections';
const TABELA_NOMES = 'cmd_tse_live_candidates';
const TABELA_ESTADO = 'cmd_tse_live_state';

/** Quanto tempo uma coleta pode durar (a rota tem 60 s). */
const PRAZO_PADRAO_MS = 40_000;
const SIMULTANEAS = 3;
const INTERVALO_MS = 70;
/** Secao sem boletim: so volta a ser consultada depois disto. */
const REVER_DEPOIS_MS = 4 * 60_000;
/** Secoes por coleta, no maximo. */
const POR_COLETA = 450;
const NOMES_VALEM_MS = 30 * 60_000;
const PAUSA_DO_TSE_MS = 11 * 60_000;

/** O turno e o estado apurados. Os codigos do 2o turno chegam por variavel de ambiente. */
export function configuracaoAoVivo(): ConfiguracaoDaApuracao & { uf: string } {
  const num = (nome: string, padrao: number) => {
    const valor = Number(process.env[nome]);
    return Number.isInteger(valor) && valor > 0 ? valor : padrao;
  };
  return {
    base: process.env.TSE_BASE?.trim() || APURACAO_2026_1T.base,
    ano: num('TSE_ANO', APURACAO_2026_1T.ano),
    turno: num('TSE_TURNO', APURACAO_2026_1T.turno),
    pleito: num('TSE_PLEITO', APURACAO_2026_1T.pleito),
    eleicaoFederal: num('TSE_ELEICAO_FEDERAL', APURACAO_2026_1T.eleicaoFederal),
    eleicaoEstadual: num('TSE_ELEICAO_ESTADUAL', APURACAO_2026_1T.eleicaoEstadual),
    uf: (process.env.TSE_UF?.trim() || 'AL').toUpperCase(),
  };
}

export interface SituacaoAoVivo {
  uf: string;
  ano: number;
  turno: number;
  totalDeSecoes: number;
  secoesApuradas: number;
  ultimaColeta: string | null;
  pausadoAte: string | null;
  ultimoErro: string | null;
}

interface EstadoRow {
  lock_until: string;
  paused_until: string | null;
  names_at: string | null;
  last_run_at: string | null;
  last_error: string | null;
  sections_total: number;
  sections_done: number;
}

interface SecaoRow {
  city_code: number;
  zone: number;
  section: number;
}

async function estado(c: ReturnType<typeof configuracaoAoVivo>): Promise<EstadoRow | null> {
  return selectOne<EstadoRow>(TABELA_ESTADO, {
    select: '*',
    filters: { pleito: `eq.${c.pleito}`, uf: `eq.${c.uf}` },
  }).catch(() => null);
}

function situacao(c: ReturnType<typeof configuracaoAoVivo>, e: EstadoRow | null): SituacaoAoVivo {
  return {
    uf: c.uf,
    ano: c.ano,
    turno: c.turno,
    totalDeSecoes: e?.sections_total ?? 0,
    secoesApuradas: e?.sections_done ?? 0,
    ultimaColeta: e?.last_run_at ?? null,
    pausadoAte: e?.paused_until && new Date(e.paused_until) > new Date() ? e.paused_until : null,
    ultimoErro: e?.last_error ?? null,
  };
}

export async function situacaoAoVivo(): Promise<SituacaoAoVivo> {
  const c = configuracaoAoVivo();
  return situacao(c, await estado(c));
}

/* -------------------------------------------------------------------------
   Requisicoes ao TSE, com freio
   ------------------------------------------------------------------------- */

class TsePediuPausa extends Error {}

function freio() {
  let ultima = 0;
  let recusasSeguidas = 0;
  return async function baixar(url: string): Promise<{ status: number; corpo?: ArrayBuffer }> {
    const espera = ultima + INTERVALO_MS - Date.now();
    ultima = Math.max(Date.now(), ultima + INTERVALO_MS);
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    let resposta: Response;
    try {
      resposta = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    } catch {
      return { status: 0 };
    }
    if (resposta.status === 403 || resposta.status === 429) {
      recusasSeguidas += 1;
      if (recusasSeguidas >= 5) throw new TsePediuPausa();
      return { status: resposta.status };
    }
    recusasSeguidas = 0;
    if (!resposta.ok) return { status: resposta.status };
    return { status: 200, corpo: await resposta.arrayBuffer() };
  };
}

const json = (corpo: ArrayBuffer | undefined): unknown => JSON.parse(new TextDecoder('utf-8').decode(corpo));
const zeros = (n: number, tam: number) => String(n).padStart(tam, '0');

/* -------------------------------------------------------------------------
   A coleta
   ------------------------------------------------------------------------- */

export async function coletarAoVivo(prazoMs = PRAZO_PADRAO_MS): Promise<SituacaoAoVivo & { coletou: boolean; novas: number }> {
  const c = configuracaoAoVivo();
  const chave = { pleito: c.pleito, uf: c.uf };
  const filtro = { pleito: `eq.${c.pleito}`, uf: `eq.${c.uf}` };

  const pegou = await callFunction<boolean>('cmd_tse_live_lock', {
    p_pleito: c.pleito,
    p_uf: c.uf,
    p_segundos: Math.ceil(prazoMs / 1000) + 30,
  });
  if (!pegou) return { ...situacao(c, await estado(c)), coletou: false, novas: 0 };

  const fim = Date.now() + prazoMs;
  const baixar = freio();
  let novas = 0;
  let erro: string | null = null;
  const atual = await estado(c);
  let total = atual?.sections_total ?? 0;
  let feitas = atual?.sections_done ?? 0;

  try {
    // 1. A lista de secoes da UF: uma vez so.
    if (total === 0) {
      const r = await baixar(urlDaListaDeSecoes(c, c.uf));
      if (r.status !== 200) throw new Error(`A lista de seções do TSE não abriu (HTTP ${r.status}).`);
      const secoes = secoesDaLista(json(r.corpo));
      await upsertRows(
        TABELA_SECOES,
        secoes.map((s) => ({ ...chave, city_code: Number(s.municipio), zone: Number(s.zona), section: Number(s.secao) })),
        'pleito,uf,zone,section',
      );
      total = secoes.length;
    }

    // 2. Os nomes dos candidatos, renovados de tempos em tempos.
    if (!atual?.names_at || Date.now() - new Date(atual.names_at).getTime() > NOMES_VALEM_MS) {
      for (const cargo of CARGOS_DA_APURACAO) {
        const r = await baixar(urlDosCandidatos(c, c.uf, cargo.codigo, cargo.federal));
        if (r.status !== 200) continue;
        const nomes = nomesDoCargo(json(r.corpo), cargo.codigo);
        await upsertRows(
          TABELA_NOMES,
          nomes.map((n) => ({
            ...chave,
            office_code: n.cargo,
            number: n.numero,
            name: n.nome.slice(0, 200),
            party: n.partido?.slice(0, 40) ?? null,
            kind: n.tipo,
          })),
          'pleito,uf,office_code,number',
        );
      }
      await updateRows(TABELA_ESTADO, filtro, { names_at: new Date().toISOString() });
    }

    // 3. A fila: secoes sem boletim, da consultada ha mais tempo.
    const antes = new Date(Date.now() - REVER_DEPOIS_MS).toISOString();
    const fila = await selectRows<SecaoRow>(TABELA_SECOES, {
      select: 'city_code,zone,section',
      filters: { ...filtro, votes: 'is.null', or: `(checked_at.is.null,checked_at.lt."${antes}")` },
      order: 'checked_at.asc.nullsfirst',
      limit: POR_COLETA,
    });

    const pendentes: Record<string, string | number | null | object>[] = [];
    const gravar = async () => {
      if (pendentes.length === 0) return;
      await upsertRows(TABELA_SECOES, pendentes.splice(0), 'pleito,uf,zone,section');
    };

    let proxima = 0;
    const trabalhar = async () => {
      while (proxima < fila.length && Date.now() < fim) {
        // Grava aos poucos: se a funcao for encerrada no meio, o que ja
        // foi lido nao se perde.
        if (pendentes.length >= 60) await gravar();
        const row = fila[proxima];
        proxima += 1;
        const s: SecaoDaApuracao = {
          municipio: zeros(row.city_code, 5),
          zona: zeros(row.zone, 4),
          secao: zeros(row.section, 4),
        };
        const base = { ...chave, city_code: row.city_code, zone: row.zone, section: row.section, checked_at: new Date().toISOString() };

        const aux = await baixar(urlDoAuxiliar(c, c.uf, s));
        if (aux.status !== 200) {
          pendentes.push({ ...base, status: aux.status === 404 ? 'não publicado' : `erro ${aux.status}` });
          continue;
        }
        const publicado = boletimDoAuxiliar(json(aux.corpo));
        if (!publicado) {
          const st = (json(aux.corpo) as { st?: string } | null)?.st;
          pendentes.push({ ...base, status: (st || 'sem boletim').slice(0, 80) });
          continue;
        }
        const bu = await baixar(urlDoBoletim(c, c.uf, s, publicado.hash, publicado.arquivo));
        if (bu.status !== 200 || !bu.corpo) {
          pendentes.push({ ...base, status: `boletim: erro ${bu.status}` });
          continue;
        }
        try {
          const boletim = lerBoletimDeUrna(new Uint8Array(bu.corpo));
          pendentes.push({
            ...base,
            status: (publicado.situacao || 'Recebido').slice(0, 80),
            hash: publicado.hash.slice(0, 200),
            received_at: publicado.recebido.slice(0, 40),
            place_number: boletim.local,
            turnout: comparecimentoDoBoletim(boletim),
            votes: votosDoBoletim(boletim),
          });
          novas += 1;
        } catch (e) {
          pendentes.push({ ...base, status: e instanceof BoletimIlegivel ? 'boletim ilegível' : 'boletim: erro' });
        }
      }
    };
    await Promise.all(Array.from({ length: SIMULTANEAS }, trabalhar));
    await gravar();

    // 4. O que chegou vira a votacao que o mapa le.
    if (novas > 0) {
      await callFunction<number>('cmd_tse_live_consolidate', {
        p_pleito: c.pleito,
        p_uf: c.uf,
        p_year: c.ano,
        p_round: c.turno,
      });
    }
    feitas += novas;
  } catch (e) {
    if (e instanceof TsePediuPausa) {
      erro = 'O TSE recusou várias consultas seguidas: a coleta pausou por 11 minutos.';
      await updateRows(TABELA_ESTADO, filtro, { paused_until: new Date(Date.now() + PAUSA_DO_TSE_MS).toISOString() });
    } else {
      erro = e instanceof Error ? e.message.slice(0, 500) : 'Falha na coleta.';
    }
  } finally {
    await updateRows(TABELA_ESTADO, filtro, {
      lock_until: new Date().toISOString(),
      last_run_at: new Date().toISOString(),
      last_error: erro,
      sections_total: total,
      sections_done: feitas,
    }).catch(() => undefined);
  }

  return { ...situacao(c, await estado(c)), coletou: true, novas };
}
