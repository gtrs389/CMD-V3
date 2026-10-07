import type { MapOverviewPayload, PollingPlacePin } from './map-pin';
import { sectionKey } from './map-pin';
import { chaveDaSecao, confrontar, type EscolaNoComparativo, type EscolaNoConfronto, type LiderNoRaioX } from './confronto';
import { lideresDasReferencias, placeOfLeader, placeOfLeaders, placeOfSection } from './map-filters';
import type { CandidatoDaVotacao } from './votacao-tse';

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

/** Uma secao, pela zona e pelo numero (nulos: o cadastro sem secao). */
interface SecaoComNumero {
  zona: string | null;
  secao: string | null;
}

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
  escola: { chave: string; secoes: readonly SecaoComNumero[] },
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
  escola: { secoes: readonly (SecaoComNumero & { estimativa: number })[] },
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

/* -------------------------------------------------------------------------
   A pagina da Sala: o recorte do envio, a escola de novo, zonas e Lideres
   ------------------------------------------------------------------------- */

/** O recorte do mapa quando a escola foi enviada: a estimativa volta igual. */
export interface RecorteDaSala {
  /** Chave do Lider do filtro (`leaderKey`). */
  leader?: string | null;
  /** Chaves das referencias do filtro. */
  references?: string[];
  /** Secao do filtro (`zona/secao`). */
  section?: string | null;
  /** "Referência: Dep. Paulinho" — como o recorte aparece na tela. */
  rotulo?: string | null;
}

/** Os pinos da campanha no recorte (Lider, referencia, secao), como o mapa calcula. */
export function campanhaDoRecorte(
  payload: Pick<MapOverviewPayload, 'pins' | 'pollingPlaces' | 'referencias'> | null | undefined,
  recorte: RecorteDaSala,
): PollingPlacePin[] {
  const daReferencia = recorte.references?.length ? lideresDasReferencias(payload, recorte.references) : null;
  return (payload?.pollingPlaces ?? [])
    .map((p) => (daReferencia ? placeOfLeaders(p, daReferencia) : p))
    .map((p) => (p && recorte.leader ? placeOfLeader(p, recorte.leader) : p))
    .map((p) => (p && recorte.section ? placeOfSection(p, recorte.section) : p))
    .filter((p): p is PollingPlacePin => p !== null);
}

/** Os votos do TSE no recorte: com secao no filtro, so ela. */
export function votacaoDoRecorte(pins: readonly PollingPlacePin[], recorte: RecorteDaSala): PollingPlacePin[] {
  if (!recorte.section) return [...pins];
  return pins.map((p) => placeOfSection(p, recorte.section!)).filter((p): p is PollingPlacePin => p !== null);
}

/**
 * A escola enviada, achada de novo no confronto de hoje: pela chave (o
 * local do TSE) ou pelos pinos da campanha. Tenta a votacao de cada
 * candidato da esquerda — o primeiro pode nao ter voto nenhum ali — e
 * prefere a escola casada com o TSE a de so campanha.
 */
export function escolaDaSala(
  campanha: readonly PollingPlacePin[],
  votacoes: readonly (readonly PollingPlacePin[])[],
  alvo: { chave: string; pinos: readonly string[] },
): EscolaNoConfronto | null {
  const pinos = new Set(alvo.pinos);
  let soCampanha: EscolaNoConfronto | null = null;
  for (const tse of votacoes.length ? votacoes : [[]]) {
    const escolas = confrontar(campanha, tse).escolas;
    const pelaChave = escolas.find((e) => e.chave === alvo.chave);
    if (pelaChave) return pelaChave;
    const pelosPinos = escolas.find((e) => e.pinosDaCampanha.some((p) => pinos.has(p)));
    if (pelosPinos && !pelosPinos.chave.startsWith('campanha:')) return pelosPinos;
    soCampanha ??= pelosPinos ?? null;
  }
  return soCampanha;
}

/** Uma zona no duelo: as secoes dela somadas. */
export interface ZonaNoDuelo {
  zona: string | null;
  secoes: SecaoNoDuelo[];
  estimativa: number;
  dosLideres: number;
  totalEsquerda: number;
  totalDireita: number;
  vitorias: { esquerda: number; direita: number; empate: number };
}

/** O duelo zona a zona, na ordem da zona. */
export function porZona(secoes: readonly SecaoNoDuelo[]): ZonaNoDuelo[] {
  const zonas = new Map<string, ZonaNoDuelo>();
  for (const s of secoes) {
    const k = s.zona ?? '';
    const z = zonas.get(k) ?? {
      zona: s.zona,
      secoes: [],
      estimativa: 0,
      dosLideres: 0,
      totalEsquerda: 0,
      totalDireita: 0,
      vitorias: { esquerda: 0, direita: 0, empate: 0 },
    };
    z.secoes.push(s);
    z.estimativa += s.estimativa;
    z.dosLideres += s.dosLideres;
    z.totalEsquerda += s.totalEsquerda;
    z.totalDireita += s.totalDireita;
    if (s.vencedor === 'ESQUERDA') z.vitorias.esquerda += 1;
    else if (s.vencedor === 'DIREITA') z.vitorias.direita += 1;
    else if (s.vencedor === 'EMPATE') z.vitorias.empate += 1;
    zonas.set(k, z);
  }
  return [...zonas.values()].sort((a, b) => (a.zona ?? '').localeCompare(b.zona ?? '', 'pt-BR', { numeric: true }));
}

/** O placar de um Lider: o duelo so nas secoes onde a gente dele vota. */
export interface PlacarDoLider {
  lider: LiderNoRaioX;
  /** As secoes dele, da que tem mais gente dele para a que tem menos. */
  secoes: { secao: SecaoNoDuelo; pessoas: number }[];
  pessoas: number;
  esquerda: number;
  direita: number;
  vitorias: number;
  derrotas: number;
  /**
   * Votos de cada candidato do seu lado, em media, nas secoes dele, por
   * pessoa que ele cadastrou ali (%). Em media: com dois candidatos (federal
   * e estadual), cada pessoa pode dar um voto a cada um. Nulo sem gente com secao.
   */
  conversao: number | null;
}

/** Cada Lider da escola com o placar das secoes dele, do que mais cadastrou para o que menos. */
export function placarDosLideres(
  secoes: readonly SecaoNoDuelo[],
  lideres: readonly LiderNoRaioX[],
  /** Quantos candidatos ha do seu lado (a conversao e a media deles). */
  candidatosDaEsquerda = 1,
): PlacarDoLider[] {
  const porChave = new Map(secoes.map((s) => [s.chave, s]));
  return lideres
    .map((lider): PlacarDoLider => {
      const dele = Object.entries(lider.porSecao)
        .map(([k, pessoas]) => ({ secao: porChave.get(k), pessoas }))
        .filter((x): x is { secao: SecaoNoDuelo; pessoas: number } => Boolean(x.secao) && x.pessoas > 0)
        .sort((a, b) => b.pessoas - a.pessoas || a.secao.chave.localeCompare(b.secao.chave, 'pt-BR', { numeric: true }));
      const pessoas = dele.reduce((t, x) => t + x.pessoas, 0);
      const esquerda = dele.reduce((t, x) => t + x.secao.totalEsquerda, 0);
      return {
        lider,
        secoes: dele,
        pessoas,
        esquerda,
        direita: dele.reduce((t, x) => t + x.secao.totalDireita, 0),
        vitorias: dele.filter((x) => x.secao.vencedor === 'ESQUERDA').length,
        derrotas: dele.filter((x) => x.secao.vencedor === 'DIREITA').length,
        conversao: pessoas > 0 ? (esquerda / Math.max(1, candidatosDaEsquerda) / pessoas) * 100 : null,
      };
    })
    .sort((a, b) => b.lider.cadastrados - a.lider.cadastrados || a.lider.nome.localeCompare(b.lider.nome, 'pt-BR'));
}

/** O que a lista da Sala mostra de cada escola sem recalcular nada. */
export interface ResumoDaEscolaNaSala {
  estimativa: number;
  secoes: number;
  zonas: string[];
  lideres: number;
  /** O placar da ultima vez que o duelo foi aberto (sem adversario: so a esquerda). */
  esquerda?: number;
  direita?: number;
  vitorias?: { esquerda: number; direita: number; empate: number };
  /** Votos de cada candidato da esquerda, na ordem dela. */
  apurado?: number[];
  em?: string;
}

export function resumoDoDuelo(
  duelo: Duelo,
  escola: { estimativa: number },
  lideres: number,
): Omit<ResumoDaEscolaNaSala, 'em'> {
  return {
    estimativa: escola.estimativa,
    secoes: duelo.secoes.length,
    zonas: [...new Set(duelo.secoes.map((s) => s.zona).filter((z): z is string => Boolean(z)))],
    lideres,
    esquerda: duelo.totalEsquerda,
    direita: duelo.totalDireita,
    vitorias: duelo.vitorias,
    apurado: duelo.esquerda,
  };
}

/** Uma escola na Sala de Confronto (migration 060), como a API devolve. */
export interface EscolaNaSala {
  id: string;
  /** O time ('' no mapa geral do ADMIN). */
  scope: string;
  /** O nome do time, ou "Mapa geral". */
  scopeName: string | null;
  chave: string;
  titulo: string;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  pinos: string[];
  /** O lado esquerdo: os candidatos do mapa no envio. */
  esquerda: CandidatoDaVotacao[];
  /** O lado direito: os adversarios chamados na sala. */
  direita: CandidatoDaVotacao[];
  /** Os Lideres selecionados (chave e nome). */
  lideres: { id: string; nome: string }[];
  recorte: RecorteDaSala;
  resumo: Partial<ResumoDaEscolaNaSala>;
  enviadoPor: string | null;
  enviadoEm: string;
  atualizadoEm: string;
}

/** O que o Raio-X manda ao enviar a escola. */
export interface EnvioParaASala {
  clientId?: string | null;
  chave: string;
  titulo: string;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  pinos: string[];
  esquerda: CandidatoDaVotacao[];
  lideres: { id: string; nome: string }[];
  recorte: RecorteDaSala;
  resumo: Partial<ResumoDaEscolaNaSala>;
}
