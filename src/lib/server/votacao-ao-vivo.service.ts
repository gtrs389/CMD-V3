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
import { callFunction, insertRows, selectOne, selectRows, updateRows, upsertRows } from '@/lib/supabase/rest';
import { mudancasEntre, resultadoDoCargo, retratoDe, type ResultadoDoCargo } from '@/lib/domain/apuracao';

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
const TABELA_RESULTADOS = 'cmd_tse_live_results';

/**
 * Guarda a leitura nova de um cargo: o resultado (o que a Sala mostra), um
 * retrato para o grafico da noite e o que mudou desde a leitura anterior.
 */
async function guardarResultado(
  chave: { pleito: number; uf: string },
  resultado: ResultadoDoCargo,
  anterior: ResultadoDoCargo | null,
): Promise<void> {
  const agora = new Date().toISOString();
  const versao = (resultado.versao ?? agora).slice(0, 40);
  const retrato = retratoDe(resultado, agora);
  await upsertRows(
    TABELA_RESULTADOS,
    [{ ...chave, office_code: resultado.cargo, version: versao, payload: resultado, fetched_at: agora }],
    'pleito,uf,office_code',
  );
  await upsertRows(
    'cmd_tse_live_history',
    [
      {
        ...chave,
        office_code: resultado.cargo,
        version: versao,
        at: agora,
        tse_time: retrato.horaTse,
        pct_sections: retrato.pctSecoes,
        leaders: retrato.lideres,
      },
    ],
    'pleito,uf,office_code,version',
  );
  const mudancas = mudancasEntre(anterior, resultado);
  if (mudancas.length > 0) {
    await insertRows(
      'cmd_tse_live_events',
      mudancas.map((m) => ({
        ...chave,
        office_code: resultado.cargo,
        at: agora,
        tse_time: retrato.horaTse,
        kind: m.tipo,
        text: m.texto.slice(0, 300),
        number: m.numero,
      })),
      'id',
    );
  }
}

/** Quanto tempo uma coleta pode durar (a rota tem 60 s). */
const PRAZO_PADRAO_MS = 40_000;
/**
 * Ritmo: 6 consultas ao mesmo tempo, no maximo uma a cada 40 ms (~25 por
 * segundo). O TSE bloqueia acima de ~100 por segundo, ou com muito 404 — e
 * 404 quase nao ha, porque so se consulta secao cujo boletim ja chegou.
 */
const SIMULTANEAS = 6;
const INTERVALO_MS = 40;
/** Boletim que chegou mas ainda nao estava no auxiliar: tenta de novo logo. */
const REVER_CHEGADA_MS = 60_000;
/** Sem o sinal de chegada na lista (formato antigo): consulta as cegas, devagar. */
const REVER_SEM_SINAL_MS = 4 * 60_000;
/** Secoes por coleta, no maximo (o banco devolve ate 1000 linhas por consulta). */
const POR_COLETA = 1000;
/** A lista de secoes (com o sinal de chegada) e relida a cada 2 minutos. */
const LISTA_VALE_MS = 2 * 60_000;
/**
 * O resultado de cada cargo (nomes, totais oficiais, porcentagens, situacao)
 * e relido a cada 30 s. So o que mudou de versao no TSE e gravado.
 */
const RESULTADO_VALE_MS = 30_000;
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
  list_at: string | null;
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

/**
 * Por que a lista de secoes do TSE nao abriu, em palavras de quem resolve.
 *
 * O TSE costuma recusar acessos vindos de fora do Brasil durante a apuracao,
 * e a Vercel roda as funcoes nos EUA por padrao: e o caso mais provavel do
 * 403 e da falta de resposta.
 */
export function motivoDaRecusa(status: number): string {
  if (status === 403 || status === 429 || status === 0) {
    return (
      `O TSE ${status === 0 ? 'não respondeu ao servidor' : `recusou a consulta do servidor (HTTP ${status})`}. ` +
      'O TSE costuma bloquear acessos de fora do Brasil durante a apuração, e a Vercel roda nos EUA por padrão: ' +
      'em Vercel → Settings → Functions → Function Region, escolha São Paulo (gru1) e publique de novo.'
    );
  }
  if (status === 404) {
    return 'O TSE ainda não publicou a lista de seções deste turno (HTTP 404). Confira os códigos do turno (TSE_PLEITO).';
  }
  return `A lista de seções do TSE não abriu (HTTP ${status}).`;
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
  let nomesNovos = false;
  let erro: string | null = null;
  const atual = await estado(c);
  let total = atual?.sections_total ?? 0;
  let feitas = atual?.sections_done ?? 0;

  try {
    // 1. A lista de secoes da UF, relida a cada 2 minutos: e ela que diz
    //    quais boletins ja chegaram (da/ha). Assim a coleta vai direto nas
    //    secoes certas, em vez de perguntar por todas.
    let comSinal: boolean | null = null;
    if (total === 0 || !atual?.list_at || Date.now() - new Date(atual.list_at).getTime() > LISTA_VALE_MS) {
      const r = await baixar(urlDaListaDeSecoes(c, c.uf));
      if (r.status !== 200) {
        if (total === 0) throw new Error(motivoDaRecusa(r.status));
      } else {
        const secoes = secoesDaLista(json(r.corpo));
        comSinal = secoes.some((s) => s.chegada);
        // Na primeira vez entram todas; depois, so as que ganharam sinal.
        const novasNaLista = total === 0 ? secoes : secoes.filter((s) => s.chegada);
        await upsertRows(
          TABELA_SECOES,
          novasNaLista.map((s) => ({
            ...chave,
            city_code: Number(s.municipio),
            zone: Number(s.zona),
            section: Number(s.secao),
            arrived_at: s.chegada?.slice(0, 40) ?? null,
          })),
          'pleito,uf,zone,section',
        );
        total = secoes.length;
        await updateRows(TABELA_ESTADO, filtro, { list_at: new Date().toISOString() });
      }
    }

    // 2. O resultado de cada cargo: nomes, totais oficiais, porcentagem,
    //    situacao. E a Sala de Apuracao; e de onde saem os nomes do mapa.
    if (!atual?.names_at || Date.now() - new Date(atual.names_at).getTime() > RESULTADO_VALE_MS) {
      const anteriores = await selectRows<{ office_code: number; version: string | null; payload: ResultadoDoCargo }>(
        TABELA_RESULTADOS,
        { select: 'office_code,version,payload', filters: filtro },
      ).catch(() => []);
      for (const cargo of CARGOS_DA_APURACAO) {
        const r = await baixar(urlDosCandidatos(c, c.uf, cargo.codigo, cargo.federal));
        if (r.status !== 200) continue;
        const bruto = json(r.corpo);
        const resultado = resultadoDoCargo(bruto);
        const anterior = anteriores.find((a) => a.office_code === cargo.codigo) ?? null;
        // Mesma versao do TSE: nada mudou, nada a gravar.
        if (resultado?.versao && anterior?.version === resultado.versao) continue;
        if (resultado) {
          // Sem a migration 058, a coleta segue; so a Sala fica sem dados.
          await guardarResultado(chave, resultado, anterior?.payload ?? null).catch(() => undefined);
        }
        const nomes = nomesDoCargo(bruto, cargo.codigo);
        await upsertRows(
          TABELA_NOMES,
          nomes.map((n) => ({
            ...chave,
            office_code: n.cargo,
            number: n.numero,
            name: n.nome.slice(0, 200),
            party: n.partido?.slice(0, 40) ?? null,
            kind: n.tipo,
            official_votes: n.votosOficiais,
          })),
          'pleito,uf,office_code,number',
        );
      }
      await updateRows(TABELA_ESTADO, filtro, { names_at: new Date().toISOString() });
      nomesNovos = true;
    }

    // 3. A fila: secoes sem boletim. Com o sinal de chegada, so as que ja
    //    chegaram; sem ele (formato antigo da lista), todas, devagar.
    if (comSinal === null) {
      const algum = await selectRows<{ section: number }>(TABELA_SECOES, {
        select: 'section',
        filters: { ...filtro, arrived_at: 'not.is.null' },
        limit: 1,
      });
      comSinal = algum.length > 0;
    }
    const antes = new Date(Date.now() - (comSinal ? REVER_CHEGADA_MS : REVER_SEM_SINAL_MS)).toISOString();
    const fila = await selectRows<SecaoRow>(TABELA_SECOES, {
      select: 'city_code,zone,section',
      filters: {
        ...filtro,
        votes: 'is.null',
        ...(comSinal ? { arrived_at: 'not.is.null' } : {}),
        or: `(checked_at.is.null,checked_at.lt."${antes}")`,
      },
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

    // 4. O que chegou (e os totais oficiais novos) vira a votacao que o mapa le.
    if (novas > 0 || nomesNovos) {
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
