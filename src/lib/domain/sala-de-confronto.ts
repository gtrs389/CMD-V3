import type { PollingPlacePin } from './map-pin';
import { sectionKey } from './map-pin';
import { chaveDaSecao, type EscolaNoComparativo, type LiderNoRaioX } from './confronto';

/**
 * Sala de Confronto: dentro de uma escola, os candidatos que o time
 * escolheu (o lado ESQUERDO) contra outros candidatos (o lado DIREITO),
 * secao por secao.
 *
 * Modulo puro. Cada lado e uma lista de candidatos, e cada candidato e um
 * mapa secao -> votos. A soma dos candidatos de um lado e a forca do lado
 * na secao; quem tem mais leva a secao. Junto vai a estimativa do time (e a
 * parte dos Lideres selecionados no raio-x): onde o time tinha gente e
 * perdeu, a secao pede trabalho.
 */

/** Os votos de um candidato numa secao da escola. */
export interface VotosNaSecao {
  zona: string | null;
  secao: string | null;
  votos: number;
}

/** Os votos de um candidato na escola, pela chave da secao (`chaveDaSecao`). */
export type VotosPorSecao = Map<string, VotosNaSecao>;

const limpar = (v: string | null | undefined) => {
  const t = (v ?? '').trim().replace(/^0+(?=\d)/, '');
  return t || null;
};

/** Os votos do candidato `i` do comparativo da escola (o lado esquerdo). */
export function votosDoComparativo(escola: Pick<EscolaNoComparativo, 'secoes'>, i: number): VotosPorSecao {
  const m: VotosPorSecao = new Map();
  for (const s of escola.secoes) {
    if (!s.zona && !s.secao) continue;
    m.set(chaveDaSecao(s.zona, s.secao), { zona: s.zona, secao: s.secao, votos: s.apurado[i] ?? 0 });
  }
  return m;
}

/**
 * Os votos de outro candidato (a votacao dele, do TSE) nesta escola. A
 * escola se acha pela secao — zona e secao sao unicas no estado — ou pelo
 * proprio local do TSE. Com `soAsDaEscola`, so as secoes que o raio-x ja
 * mostra (quando o mapa esta filtrado por uma secao).
 */
export function votosNaEscola(
  escola: Pick<EscolaNoComparativo, 'chave' | 'secoes'>,
  votacao: readonly PollingPlacePin[],
  soAsDaEscola = false,
): VotosPorSecao {
  const daEscola = new Set(escola.secoes.filter((s) => s.zona || s.secao).map((s) => chaveDaSecao(s.zona, s.secao)));
  const m: VotosPorSecao = new Map();
  for (const pin of votacao) {
    const aqui = pin.locationId === escola.chave || pin.sections.some((s) => (s.zone || s.section) && daEscola.has(sectionKey(s)));
    if (!aqui) continue;
    for (const s of pin.sections) {
      if (!s.zone && !s.section) continue;
      const k = sectionKey(s);
      if (soAsDaEscola && !daEscola.has(k)) continue;
      const atual = m.get(k) ?? { zona: limpar(s.zone), secao: limpar(s.section), votos: 0 };
      atual.votos += s.total;
      m.set(k, atual);
    }
  }
  return m;
}

export type VencedorDaSecao = 'ESQUERDA' | 'DIREITA' | 'EMPATE' | 'SEM_VOTOS';

export interface SecaoNoDuelo {
  chave: string;
  zona: string | null;
  secao: string | null;
  /** Pessoas do time que votam nesta secao (o recorte do raio-x). */
  estimativa: number;
  /** Delas, quantas sao dos Lideres selecionados. */
  dosLideres: number;
  /** Votos de cada candidato da esquerda, na ordem da lista. */
  esquerda: number[];
  direita: number[];
  totalEsquerda: number;
  totalDireita: number;
  vencedor: VencedorDaSecao;
  /** Esquerda menos direita. */
  saldo: number;
}

export interface Duelo {
  secoes: SecaoNoDuelo[];
  /** O total de cada candidato na escola. */
  esquerda: number[];
  direita: number[];
  totalEsquerda: number;
  totalDireita: number;
  vitorias: { esquerda: number; direita: number; empate: number };
  /** Votos que faltaram a esquerda para virar cada secao perdida (um a mais que a diferenca). */
  paraVirar: number;
  /** A secao que a esquerda perdeu por menos (a mais perto de virar). */
  maisDisputada: SecaoNoDuelo | null;
  maiorVitoria: SecaoNoDuelo | null;
  maiorDerrota: SecaoNoDuelo | null;
  /** So as secoes onde os Lideres selecionados tem gente. Nulo sem Lider selecionado. */
  dosLideres: { secoes: number; pessoas: number; esquerda: number; direita: number; vitorias: number; derrotas: number } | null;
}

/**
 * O duelo da escola: as secoes de qualquer um dos lados (mais as da
 * estimativa), na ordem da zona e da secao, para bater com a urna.
 */
export function montarDuelo(
  escola: Pick<EscolaNoComparativo, 'secoes'>,
  esquerda: readonly VotosPorSecao[],
  direita: readonly VotosPorSecao[],
  lideres: readonly Pick<LiderNoRaioX, 'porSecao'>[] = [],
): Duelo {
  const linhas = new Map<string, { zona: string | null; secao: string | null; estimativa: number }>();
  for (const s of escola.secoes) {
    if (!s.zona && !s.secao) continue;
    linhas.set(chaveDaSecao(s.zona, s.secao), { zona: s.zona, secao: s.secao, estimativa: s.estimativa });
  }
  for (const lado of [esquerda, direita]) {
    for (const m of lado) for (const [k, v] of m) if (!linhas.has(k)) linhas.set(k, { zona: v.zona, secao: v.secao, estimativa: 0 });
  }

  const secoes = [...linhas.entries()]
    .map(([chave, l]): SecaoNoDuelo => {
      const e = esquerda.map((m) => m.get(chave)?.votos ?? 0);
      const d = direita.map((m) => m.get(chave)?.votos ?? 0);
      const totalEsquerda = e.reduce((t, n) => t + n, 0);
      const totalDireita = d.reduce((t, n) => t + n, 0);
      return {
        chave,
        ...l,
        dosLideres: lideres.reduce((t, x) => t + (x.porSecao[chave] ?? 0), 0),
        esquerda: e,
        direita: d,
        totalEsquerda,
        totalDireita,
        saldo: totalEsquerda - totalDireita,
        vencedor:
          totalEsquerda === 0 && totalDireita === 0
            ? 'SEM_VOTOS'
            : totalEsquerda > totalDireita
              ? 'ESQUERDA'
              : totalEsquerda < totalDireita
                ? 'DIREITA'
                : 'EMPATE',
      };
    })
    .sort(
      (a, b) =>
        (a.zona ?? '').localeCompare(b.zona ?? '', 'pt-BR', { numeric: true }) ||
        (a.secao ?? '').localeCompare(b.secao ?? '', 'pt-BR', { numeric: true }),
    );

  const soma = (lista: readonly SecaoNoDuelo[], f: (s: SecaoNoDuelo) => number) => lista.reduce((t, s) => t + f(s), 0);
  const perdidas = secoes.filter((s) => s.vencedor === 'DIREITA');
  const ganhas = secoes.filter((s) => s.vencedor === 'ESQUERDA');
  const comLideres = secoes.filter((s) => s.dosLideres > 0);

  return {
    secoes,
    esquerda: esquerda.map((_, i) => soma(secoes, (s) => s.esquerda[i])),
    direita: direita.map((_, i) => soma(secoes, (s) => s.direita[i])),
    totalEsquerda: soma(secoes, (s) => s.totalEsquerda),
    totalDireita: soma(secoes, (s) => s.totalDireita),
    vitorias: {
      esquerda: ganhas.length,
      direita: perdidas.length,
      empate: secoes.filter((s) => s.vencedor === 'EMPATE').length,
    },
    paraVirar: soma(perdidas, (s) => 1 - s.saldo),
    maisDisputada: [...perdidas].sort((a, b) => b.saldo - a.saldo)[0] ?? null,
    maiorVitoria: [...ganhas].sort((a, b) => b.saldo - a.saldo)[0] ?? null,
    maiorDerrota: [...perdidas].sort((a, b) => a.saldo - b.saldo)[0] ?? null,
    dosLideres:
      lideres.length === 0
        ? null
        : {
            secoes: comLideres.length,
            pessoas: soma(comLideres, (s) => s.dosLideres),
            esquerda: soma(comLideres, (s) => s.totalEsquerda),
            direita: soma(comLideres, (s) => s.totalDireita),
            vitorias: comLideres.filter((s) => s.vencedor === 'ESQUERDA').length,
            derrotas: comLideres.filter((s) => s.vencedor === 'DIREITA').length,
          },
  };
}

/** A parte da esquerda no total da escola, em porcentagem (50 sem nenhum voto). */
export function parteDaEsquerda(d: Pick<Duelo, 'totalEsquerda' | 'totalDireita'>): number {
  const total = d.totalEsquerda + d.totalDireita;
  return total > 0 ? (d.totalEsquerda / total) * 100 : 50;
}
