/**
 * Sala de Apuracao: o resultado de cada cargo, como o TSE divulga ao vivo.
 *
 * Modulo puro. Le o arquivo de resultado do TSE de 2026
 * (`<eleicao>/dados/<uf>/<uf>-c<cargo>-e<eleicao>-u.json`) e devolve o que a
 * tela precisa: candidatos com foto, votos, porcentagem dos validos e
 * situacao; secoes totalizadas; comparecimento; brancos e nulos. Tambem
 * compara duas leituras seguidas (quem subiu, quem passou quem) — e disso que
 * sai a linha do tempo da noite.
 *
 * O TSE manda todo numero como texto, com virgula decimal: "3,554974959".
 */

export type SituacaoNaApuracao = 'ELEITO' | 'SEGUNDO_TURNO' | 'SUPLENTE' | 'NAO_ELEITO' | 'EM_APURACAO';

export interface CandidatoNaApuracao {
  numero: string;
  /** Sequencial do TSE: e por ele que se acha a foto oficial. */
  sqcand: string | null;
  nome: string;
  partido: string | null;
  votos: number;
  /** Porcentagem dos votos validos, 0 a 100. */
  pct: number;
  situacao: SituacaoNaApuracao;
  /** Texto como o TSE escreveu ("Eleito por QP", "2º turno"...). */
  situacaoTse: string;
  /** Vice ou suplentes, quando houver. */
  companhia: { tipo: string; nome: string }[];
  /** 1 = mais votado. */
  posicao: number;
}

export interface ResultadoDoCargo {
  cargo: number;
  nomeDoCargo: string;
  vagas: number;
  /** "04/10/2026 20:41:12", hora de Brasilia, como o TSE publicou. */
  atualizadoTse: string | null;
  /** Versao do arquivo no TSE: muda a cada atualizacao. */
  versao: string | null;
  /** Totalizacao final: a partir dai "Nao eleito" e definitivo. */
  final: boolean;
  secoes: { total: number; totalizadas: number; pct: number };
  eleitorado: { aptos: number; comparecimento: number; pctComparecimento: number; abstencao: number; pctAbstencao: number };
  votos: { total: number; validos: number; brancos: number; pctBrancos: number; nulos: number; pctNulos: number };
  candidatos: CandidatoNaApuracao[];
}

type Json = Record<string, unknown>;
const lista = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const texto = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

/** "1.234" / "1234" -> 1234. */
export function inteiroTse(v: unknown): number {
  const digitos = texto(v).replace(/\D/g, '');
  return digitos ? Number(digitos) : 0;
}

/** "3,554974959" -> 3.554974959. */
export function decimalTse(v: unknown): number {
  const n = Number(texto(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

const NOMES_DOS_CARGOS: Record<number, string> = {
  1: 'Presidente',
  3: 'Governador',
  5: 'Senador',
  6: 'Deputado Federal',
  7: 'Deputado Estadual',
  8: 'Deputado Distrital',
};

export function situacaoDoTse(st: string, final: boolean): SituacaoNaApuracao {
  const s = st
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (/2.? ?turno/.test(s)) return 'SEGUNDO_TURNO';
  if (s.startsWith('eleito')) return 'ELEITO';
  if (s.startsWith('suplente')) return 'SUPLENTE';
  // Antes do fim, "Nao eleito" so quer dizer "ainda nao".
  return final ? 'NAO_ELEITO' : 'EM_APURACAO';
}

/** O arquivo de resultado de um cargo, lido. Nulo se nao for o que se espera. */
export function resultadoDoCargo(json: unknown): ResultadoDoCargo | null {
  const raiz = json as Json | null;
  const carg = lista(raiz?.carg)[0];
  if (!raiz || !carg) return null;

  const final = texto(raiz.tf) === 's';
  const cargo = inteiroTse(carg.cd);
  const s = (raiz.s ?? {}) as Json;
  const e = (raiz.e ?? {}) as Json;
  const v = (raiz.v ?? {}) as Json;

  const candidatos: Omit<CandidatoNaApuracao, 'posicao'>[] = [];
  for (const agremiacao of lista(carg.agr)) {
    for (const partido of lista(agremiacao.par)) {
      for (const c of lista(partido.cand)) {
        const numero = texto(c.n);
        const nome = texto(c.nmu) || texto(c.nm);
        if (!numero || !nome) continue;
        const st = texto(c.st);
        candidatos.push({
          numero,
          sqcand: texto(c.sqcand) || null,
          nome,
          partido: texto(partido.sg) || null,
          votos: inteiroTse(c.vap),
          pct: decimalTse(c.pvapn || c.pvap),
          situacao: situacaoDoTse(st, final),
          situacaoTse: st,
          companhia: lista(c.vs)
            .map((x) => ({ tipo: texto(x.tp), nome: texto(x.nmu) || texto(x.nm) }))
            .filter((x) => x.nome),
        });
      }
    }
  }
  candidatos.sort((a, b) => b.votos - a.votos || a.nome.localeCompare(b.nome, 'pt-BR'));

  const data = [texto(raiz.dt), texto(raiz.ht)].filter(Boolean).join(' ');
  return {
    cargo,
    nomeDoCargo: texto(carg.nmn) || NOMES_DOS_CARGOS[cargo] || `Cargo ${cargo}`,
    vagas: Math.max(1, inteiroTse(carg.nv)),
    atualizadoTse: data || null,
    versao: texto(raiz.idg) || null,
    final,
    secoes: { total: inteiroTse(s.ts), totalizadas: inteiroTse(s.st), pct: decimalTse(s.pstn || s.pst) },
    eleitorado: {
      aptos: inteiroTse(e.te),
      comparecimento: inteiroTse(e.c),
      pctComparecimento: decimalTse(e.pcn || e.pc),
      abstencao: inteiroTse(e.a),
      pctAbstencao: decimalTse(e.pan || e.pa),
    },
    votos: {
      total: inteiroTse(v.tv),
      validos: inteiroTse(v.vv),
      brancos: inteiroTse(v.vb),
      pctBrancos: decimalTse(v.pvbn || v.pvb),
      nulos: inteiroTse(v.tvn || v.vn),
      pctNulos: decimalTse(v.ptvnn || v.ptvn),
    },
    candidatos: candidatos.map((c, i) => ({ ...c, posicao: i + 1 })),
  };
}

/* -------------------------------------------------------------------------
   A noite: historico e mudancas
   ------------------------------------------------------------------------- */

/** Um retrato do cargo num momento: o que o grafico da noite desenha. */
export interface RetratoDaApuracao {
  /** ISO, quando foi lido. */
  em: string;
  /** "20:41", hora do TSE. */
  horaTse: string | null;
  pctSecoes: number;
  /** Os mais votados naquele momento: [numero, votos, pct]. */
  lideres: [string, number, number][];
}

export const LIDERES_NO_RETRATO = 12;

export function retratoDe(r: ResultadoDoCargo, em: string): RetratoDaApuracao {
  return {
    em,
    horaTse: r.atualizadoTse?.split(' ')[1]?.slice(0, 5) ?? null,
    pctSecoes: r.secoes.pct,
    lideres: r.candidatos.slice(0, LIDERES_NO_RETRATO).map((c) => [c.numero, c.votos, c.pct]),
  };
}

export interface MudancaNaApuracao {
  tipo: 'LIDERANCA' | 'ULTRAPASSAGEM' | 'ELEITO' | 'SEGUNDO_TURNO' | 'MARCO';
  texto: string;
  /** Numero do candidato que protagoniza, para a foto. */
  numero: string | null;
}

/** Marcos de secoes totalizadas que viram noticia na linha do tempo. */
const MARCOS = [10, 25, 50, 75, 90, 100];

/**
 * O que mudou entre duas leituras seguidas de um cargo: troca de lider,
 * ultrapassagens dentro das vagas (e logo acima delas), eleitos, 2o turno e
 * marcos de apuracao. E a "narracao" da noite.
 */
export function mudancasEntre(antes: ResultadoDoCargo | null, agora: ResultadoDoCargo): MudancaNaApuracao[] {
  const mudancas: MudancaNaApuracao[] = [];
  const cargo = agora.nomeDoCargo;
  if (antes) {
    const posicaoAntes = new Map(antes.candidatos.map((c) => [c.numero, c.posicao]));
    const lider = agora.candidatos[0];
    if (lider && antes.candidatos[0] && antes.candidatos[0].numero !== lider.numero && lider.votos > 0) {
      mudancas.push({ tipo: 'LIDERANCA', texto: `${lider.nome} assume a liderança para ${cargo}`, numero: lider.numero });
    }
    // Ultrapassagens que importam: dentro das vagas e na disputa pela ultima.
    const zona = agora.vagas + 1;
    for (const c of agora.candidatos.slice(1, zona)) {
      const antesDele = posicaoAntes.get(c.numero);
      if (antesDele === undefined || antesDele <= c.posicao) continue;
      const passado = agora.candidatos.find(
        (x) => x.posicao > c.posicao && (posicaoAntes.get(x.numero) ?? Infinity) < antesDele,
      );
      if (passado) {
        mudancas.push({ tipo: 'ULTRAPASSAGEM', texto: `${c.nome} passa ${passado.nome} para ${cargo}`, numero: c.numero });
      }
    }
    const situacaoAntes = new Map(antes.candidatos.map((c) => [c.numero, c.situacao]));
    for (const c of agora.candidatos) {
      if (c.situacao === situacaoAntes.get(c.numero)) continue;
      if (c.situacao === 'ELEITO') mudancas.push({ tipo: 'ELEITO', texto: `${c.nome} está eleito para ${cargo}`, numero: c.numero });
      if (c.situacao === 'SEGUNDO_TURNO') {
        mudancas.push({ tipo: 'SEGUNDO_TURNO', texto: `${c.nome} vai ao 2º turno para ${cargo}`, numero: c.numero });
      }
    }
  }
  const marcoAntes = MARCOS.filter((m) => (antes?.secoes.pct ?? 0) >= m).length;
  const marcoAgora = MARCOS.filter((m) => agora.secoes.pct >= m);
  if (marcoAgora.length > marcoAntes) {
    const m = marcoAgora[marcoAgora.length - 1];
    mudancas.push({
      tipo: 'MARCO',
      texto: m === 100 ? `${cargo}: todas as seções totalizadas` : `${cargo}: ${m}% das seções totalizadas`,
      numero: null,
    });
  }
  return mudancas;
}

/** Vantagem do 1o sobre o 2o: votos e pontos percentuais. */
export function vantagem(r: ResultadoDoCargo): { votos: number; pontos: number } | null {
  const [a, b] = r.candidatos;
  if (!a || !b) return null;
  return { votos: a.votos - b.votos, pontos: a.pct - b.pct };
}

/**
 * Quanto cada candidato andou desde a leitura anterior: votos a mais e
 * posicoes ganhas (positivo = subiu). E o que pisca na tela a cada
 * atualizacao do TSE.
 */
export function variacoes(
  antes: ResultadoDoCargo | null | undefined,
  agora: ResultadoDoCargo,
): Map<string, { votos: number; posicoes: number }> {
  const mapa = new Map<string, { votos: number; posicoes: number }>();
  if (!antes || antes.versao === agora.versao) return mapa;
  const anterior = new Map(antes.candidatos.map((c) => [c.numero, c]));
  for (const c of agora.candidatos) {
    const a = anterior.get(c.numero);
    if (!a) continue;
    const votos = c.votos - a.votos;
    const posicoes = a.posicao - c.posicao;
    if (votos !== 0 || posicoes !== 0) mapa.set(c.numero, { votos, posicoes });
  }
  return mapa;
}

/**
 * As series do grafico da noite: a porcentagem de cada um dos lideres de
 * agora, retrato a retrato, contra as secoes totalizadas. A cor segue o
 * candidato (ordem pelo numero), nunca a posicao: quem passa alguem nao
 * troca de cor no meio da noite.
 */
export function seriesDaNoite(
  historico: readonly RetratoDaApuracao[],
  atual: ResultadoDoCargo,
  quantos = 4,
): { numero: string; nome: string; pontos: { x: number; y: number; hora: string | null }[] }[] {
  const lideres = atual.candidatos
    .slice(0, quantos)
    .filter((c) => c.votos > 0)
    .sort((a, b) => a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true }));
  const ordenado = [...historico].sort((a, b) => a.pctSecoes - b.pctSecoes || a.em.localeCompare(b.em));
  return lideres.map((c) => ({
    numero: c.numero,
    nome: c.nome,
    pontos: ordenado
      .map((r) => {
        const linha = r.lideres.find(([n]) => n === c.numero);
        return linha ? { x: r.pctSecoes, y: linha[2], hora: r.horaTse } : null;
      })
      .filter((p): p is { x: number; y: number; hora: string | null } => p !== null),
  }));
}
