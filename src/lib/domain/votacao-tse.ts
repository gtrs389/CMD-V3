import type { PollingPlacePin } from './map-pin';

/**
 * Votacao oficial do TSE, secao por secao.
 *
 * Modulo puro: a mesma regra le a planilha no navegador (na hora de enviar)
 * e monta as escolas do candidato no servidor (na hora de mostrar).
 *
 * A PLANILHA. O TSE publica no Portal de Dados Abertos a "votacao por secao
 * eleitoral" (votacao_secao_<ano>_<UF>.zip): uma linha por candidato por
 * secao, separada por ponto e virgula, em latin1. O boletim de urna
 * (bweb_...) tem o mesmo desenho com alguns nomes de coluna diferentes — os
 * dois sao aceitos, e as colunas sao achadas pelo NOME, nunca pela ordem.
 *
 * COMO A SECAO VIRA ESCOLA. Cada secao funciona em um unico local. O local
 * com a coordenada sai da tabela de locais do TSE que o sistema ja tem
 * (cmd_polling_places, por UF + zona + secao); o nome que a propria planilha
 * de votacao traz serve de reserva, para a escola nao sumir da lista.
 */

/* -------------------------------------------------------------------------
   Leitura da planilha
   ------------------------------------------------------------------------- */

/** As colunas que importam, e os nomes que cada uma ja teve no TSE. */
const COLUNAS = {
  ano: ['ANO_ELEICAO'],
  turno: ['NR_TURNO'],
  uf: ['SG_UF'],
  municipioCodigo: ['CD_MUNICIPIO'],
  municipio: ['NM_MUNICIPIO'],
  zona: ['NR_ZONA'],
  secao: ['NR_SECAO'],
  cargoCodigo: ['CD_CARGO', 'CD_CARGO_PERGUNTA'],
  cargo: ['DS_CARGO', 'DS_CARGO_PERGUNTA'],
  numero: ['NR_VOTAVEL'],
  nome: ['NM_VOTAVEL'],
  votos: ['QT_VOTOS'],
  tipo: ['DS_TIPO_VOTAVEL'],
  localNumero: ['NR_LOCAL_VOTACAO'],
  localNome: ['NM_LOCAL_VOTACAO'],
  localEndereco: ['DS_LOCAL_VOTACAO_ENDERECO'],
} as const;

type Coluna = keyof typeof COLUNAS;
const OBRIGATORIAS: Coluna[] = ['ano', 'turno', 'uf', 'zona', 'secao', 'cargoCodigo', 'cargo', 'numero', 'nome', 'votos'];

export type IndiceDeColunas = Record<Coluna, number>;

/** Nome de coluna sem aspas, acento, espaco nem caixa. */
const limparTitulo = (titulo: string) =>
  titulo
    .replace(/^﻿/, '')
    .replace(/"/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();

export class PlanilhaInvalida extends Error {}

/** Onde esta cada coluna. Falta de coluna obrigatoria e recusa, com o nome dela. */
export function indiceDeColunas(cabecalho: readonly string[]): IndiceDeColunas {
  const titulos = cabecalho.map(limparTitulo);
  const indice = {} as IndiceDeColunas;
  for (const [coluna, nomes] of Object.entries(COLUNAS) as [Coluna, readonly string[]][]) {
    indice[coluna] = titulos.findIndex((titulo) => nomes.includes(titulo));
  }
  const faltando = OBRIGATORIAS.filter((coluna) => indice[coluna] < 0).map((coluna) => COLUNAS[coluna][0]);
  if (faltando.length) {
    throw new PlanilhaInvalida(
      `Esta não é a planilha de votação por seção do TSE: faltam as colunas ${faltando.join(', ')}.`,
    );
  }
  return indice;
}

/** Separador da planilha, decidido pelo cabecalho. O TSE usa ponto e virgula. */
export function separadorDe(cabecalho: string): string {
  const contar = (sep: string) => cabecalho.split(sep).length;
  return [';', ',', '\t'].sort((a, b) => contar(b) - contar(a))[0];
}

/** Campos de uma linha, respeitando aspas ("a;b" e um campo so). */
export function camposDaLinha(linha: string, separador = ';'): string[] {
  const campos: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"';
        i += 1;
      } else aspas = !aspas;
    } else if (c === separador && !aspas) {
      campos.push(atual);
      atual = '';
    } else atual += c;
  }
  campos.push(atual);
  return campos.map((campo) => campo.trim());
}

/** "#NULO#", "-1" e vazio: o jeito do TSE de dizer que nao ha valor. */
const valor = (campo: string | undefined) => {
  const texto = (campo ?? '').trim();
  return !texto || texto === '#NULO#' || texto === '#NE#' || texto === '-1' ? null : texto;
};
const inteiro = (campo: string | undefined) => {
  const texto = valor(campo);
  if (!texto) return null;
  const n = Number.parseInt(texto.replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};

/* -------------------------------------------------------------------------
   O que se guarda
   ------------------------------------------------------------------------- */

export type TipoDeVoto = 'CANDIDATO' | 'LEGENDA' | 'BRANCO' | 'NULO';

/** [zona, secao, votos]: a forma compacta guardada no banco. */
export type VotoNaSecao = [number, number, number];

export interface SecaoEleitoral {
  ano: number;
  uf: string;
  zona: number;
  secao: number;
  municipioCodigo: number | null;
  municipio: string | null;
  localNumero: number | null;
  localNome: string | null;
  localEndereco: string | null;
}

export interface VotacaoDoCandidato {
  ano: number;
  turno: number;
  uf: string;
  cargoCodigo: number;
  cargo: string;
  numero: string;
  nome: string;
  tipo: TipoDeVoto;
  total: number;
  secoes: VotoNaSecao[];
}

/** Cargos proporcionais: neles, numero de dois digitos e voto na legenda. */
const PROPORCIONAIS = new Set([6, 7, 8, 13]);

export function tipoDoVoto(numero: string, cargoCodigo: number, tipoDaPlanilha?: string | null): TipoDeVoto {
  const tipo = limparTitulo(tipoDaPlanilha ?? '');
  if (tipo.startsWith('BRANCO')) return 'BRANCO';
  if (tipo.startsWith('NULO') || tipo.startsWith('ANULADO')) return 'NULO';
  if (tipo.startsWith('LEGENDA')) return 'LEGENDA';
  if (numero === '95') return 'BRANCO';
  if (numero === '96' || numero === '97') return 'NULO';
  if (PROPORCIONAIS.has(cargoCodigo) && numero.length === 2) return 'LEGENDA';
  return 'CANDIDATO';
}

/** Nome do cargo como gente escreve: "DEPUTADO ESTADUAL" -> "Deputado Estadual". */
export function nomeDoCargo(cargo: string): string {
  return cargo
    .toLowerCase()
    .replace(/(^|\s)\p{L}/gu, (letra) => letra.toUpperCase())
    .replace(/\b(De|Do|Da|Dos|Das|E)\b/g, (p) => p.toLowerCase());
}

/**
 * Junta as linhas da planilha, uma de cada vez.
 *
 * A planilha de um estado tem mais de um milhao de linhas: nada dela fica
 * guardado inteiro. Cada linha soma no candidato e na secao, e so isso
 * sobrevive.
 */
export class AcumuladorDeVotacao {
  private readonly secoes = new Map<string, SecaoEleitoral>();
  private readonly candidatos = new Map<string, VotacaoDoCandidato & { porSecao: Map<string, VotoNaSecao> }>();
  linhas = 0;
  ignoradas = 0;

  constructor(private readonly indice: IndiceDeColunas) {}

  adicionar(campos: readonly string[]): void {
    const c = (coluna: Coluna) => (this.indice[coluna] >= 0 ? campos[this.indice[coluna]] : undefined);
    const ano = inteiro(c('ano'));
    const turno = inteiro(c('turno'));
    const uf = (valor(c('uf')) ?? '').toUpperCase();
    const zona = inteiro(c('zona'));
    const secao = inteiro(c('secao'));
    const cargoCodigo = inteiro(c('cargoCodigo'));
    const cargo = valor(c('cargo'));
    const numero = valor(c('numero'))?.replace(/\D/g, '') ?? '';
    const nome = valor(c('nome')) ?? numero;
    const votos = inteiro(c('votos'));

    if (!ano || !turno || !/^[A-Z]{2}$/.test(uf) || !zona || !secao || !cargoCodigo || !cargo || !numero || votos === null) {
      this.ignoradas += 1;
      return;
    }
    this.linhas += 1;

    const chaveSecao = `${uf}/${zona}/${secao}`;
    if (!this.secoes.has(chaveSecao)) {
      this.secoes.set(chaveSecao, {
        ano,
        uf,
        zona,
        secao,
        municipioCodigo: inteiro(c('municipioCodigo')),
        municipio: valor(c('municipio')),
        localNumero: inteiro(c('localNumero')),
        localNome: valor(c('localNome')),
        localEndereco: valor(c('localEndereco')),
      });
    }
    if (votos <= 0) return;

    const chave = `${ano}/${turno}/${uf}/${cargoCodigo}/${numero}`;
    let candidato = this.candidatos.get(chave);
    if (!candidato) {
      candidato = {
        ano,
        turno,
        uf,
        cargoCodigo,
        cargo: nomeDoCargo(cargo),
        numero,
        nome,
        tipo: tipoDoVoto(numero, cargoCodigo, valor(c('tipo'))),
        total: 0,
        secoes: [],
        porSecao: new Map(),
      };
      this.candidatos.set(chave, candidato);
    }
    candidato.total += votos;
    const naSecao = candidato.porSecao.get(chaveSecao);
    if (naSecao) naSecao[2] += votos;
    else candidato.porSecao.set(chaveSecao, [zona, secao, votos]);
  }

  resultado(): { secoes: SecaoEleitoral[]; candidatos: VotacaoDoCandidato[] } {
    return {
      secoes: [...this.secoes.values()],
      candidatos: [...this.candidatos.values()]
        .map(({ porSecao, ...resto }) => ({
          ...resto,
          secoes: [...porSecao.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]),
        }))
        .sort((a, b) => a.cargoCodigo - b.cargoCodigo || b.total - a.total),
    };
  }
}

/* -------------------------------------------------------------------------
   As escolas de um candidato
   ------------------------------------------------------------------------- */

/** O minimo de um local de votacao da tabela do TSE (cmd_polling_places). */
export interface LocalDoTse {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  uf: string;
  zone: number;
  sections: number[];
  latitude: number | null;
  longitude: number | null;
}

/** O minimo de uma secao da planilha de votacao (cmd_election_sections). */
export interface SecaoDoLocal {
  zone: number;
  section: number;
  city: string | null;
  place_number: number | null;
  place_name: string | null;
  place_address: string | null;
}

export interface EscolasDoCandidato {
  /** Escolas com coordenada: viram pino no mapa. */
  noMapa: PollingPlacePin[];
  /**
   * Escolas sem coordenada conhecida. Entram no PDF e na conta, mas nunca
   * viram pino: inventar um ponto seria pior do que nao ter nenhum.
   */
  foraDoMapa: PollingPlacePin[];
}

/** Prefixo do pino de escola da votacao: nao se confunde com os pinos do cadastro. */
export const PREFIXO_DA_VOTACAO = 'tse:';

/**
 * Os votos de um candidato, escola por escola.
 *
 * O pino tem a mesma forma do pino da campanha (PollingPlacePin): total e a
 * soma das secoes, e `sections` traz zona e secao. Genero nao existe no
 * resultado da urna, entao homens e mulheres ficam zerados e o total inteiro
 * cai em "nao informado".
 */
export function escolasDoCandidato(
  votos: readonly VotoNaSecao[],
  uf: string,
  locais: readonly LocalDoTse[],
  secoes: readonly SecaoDoLocal[],
): EscolasDoCandidato {
  const porLocal = new Map<string, PollingPlacePin>();
  const temPonto = new Set<string>();
  const secaoInfo = new Map(secoes.map((s) => [`${s.zone}/${s.section}`, s]));
  // Secao -> local, montado uma vez: o candidato a governador tem voto em
  // milhares de secoes.
  const porSecao = new Map<string, LocalDoTse>();
  for (const local of locais) for (const s of local.sections) porSecao.set(`${local.zone}/${s}`, local);
  const localDaSecao = (zona: number, secao: number) => porSecao.get(`${zona}/${secao}`) ?? null;

  for (const [zona, secao, n] of votos) {
    if (n <= 0) continue;
    const local = localDaSecao(zona, secao);
    const info = secaoInfo.get(`${zona}/${secao}`) ?? null;

    const comPonto = local && local.latitude !== null && local.longitude !== null;
    // Sem local na tabela: a escola sai da propria planilha de votacao.
    const chave = local
      ? `${PREFIXO_DA_VOTACAO}${local.id}`
      : `${PREFIXO_DA_VOTACAO}${uf}/${zona}/${info?.place_number ?? info?.place_name ?? `secao-${secao}`}`;

    let pin = porLocal.get(chave);
    if (!pin) {
      pin = {
        locationId: chave,
        latitude: comPonto ? (local.latitude as number) : 0,
        longitude: comPonto ? (local.longitude as number) : 0,
        title: local?.name ?? info?.place_name ?? `Seção ${secao}`,
        address: local?.address ?? info?.place_address ?? null,
        city: local?.city ?? info?.city ?? null,
        state: uf,
        imageUrl: null,
        total: 0,
        men: 0,
        women: 0,
        others: 0,
        sections: [],
      };
      porLocal.set(chave, pin);
      if (comPonto) temPonto.add(chave);
    }
    pin.total += n;
    pin.others += n;
    pin.sections.push({ zone: String(zona), section: String(secao), total: n });
  }

  const noMapa: PollingPlacePin[] = [];
  const foraDoMapa: PollingPlacePin[] = [];
  for (const [chave, pin] of porLocal) (temPonto.has(chave) ? noMapa : foraDoMapa).push(pin);
  const maiorPrimeiro = (a: PollingPlacePin, b: PollingPlacePin) => b.total - a.total;
  return { noMapa: noMapa.sort(maiorPrimeiro), foraDoMapa: foraDoMapa.sort(maiorPrimeiro) };
}

/** "Fulano (13) · Deputado Estadual · 1º turno". */
export function rotuloDoCandidato(c: { nome: string; numero: string; cargo: string; turno: number; tipo: TipoDeVoto }): string {
  const quem = c.tipo === 'CANDIDATO' ? `${c.nome} (${c.numero})` : c.tipo === 'LEGENDA' ? `Legenda ${c.nome} (${c.numero})` : c.nome;
  return `${quem} · ${c.cargo} · ${c.turno}º turno`;
}

/* -------------------------------------------------------------------------
   O que a API devolve
   ------------------------------------------------------------------------- */

/** Um candidato na lista do seletor: sem as secoes, que pesam. */
export interface CandidatoDaVotacao {
  id: string;
  ano: number;
  turno: number;
  uf: string;
  cargoCodigo: number;
  cargo: string;
  numero: string;
  nome: string;
  tipo: TipoDeVoto;
  /** Votos contados nos boletins (ou na planilha) secao por secao. */
  total: number;
  /**
   * Total oficial no estado, como o TSE divulga na apuracao: e o numero que
   * os paineis de apuracao mostram. Na apuracao ao vivo ele anda na frente,
   * porque o boletim de cada secao e publicado um pouco depois da soma.
   * Nulo fora da apuracao ao vivo.
   */
  totalOficial: number | null;
  /**
   * Sequencial do TSE, quando a apuracao ao vivo ja o trouxe: a foto vai
   * direto por ele. Sem ele, a foto e procurada pelo numero de urna.
   */
  sqcand?: string | null;
}

export interface VotacaoNoMapa {
  candidato: CandidatoDaVotacao;
  /** Escolas com coordenada: os pinos. */
  noMapa: PollingPlacePin[];
  /** Escolas sem coordenada: so na conta e no PDF. */
  foraDoMapa: PollingPlacePin[];
}

/** Lotes que o navegador envia ao gravar a planilha. */
export const LOTE_DE_SECOES = 1000;
/** Candidatos por envio: os mais votados carregam milhares de secoes. */
export const LOTE_DE_CANDIDATOS = 60;

/** Texto de busca sem acento nem caixa. */
const paraBusca = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * Chave do favorito: ano, estado, cargo e numero — sem o turno, para quem
 * foi favorito no 1o turno continuar favorito no 2o.
 */
export function chaveDoFavorito(c: Pick<CandidatoDaVotacao, 'ano' | 'uf' | 'cargoCodigo' | 'numero'>): string {
  return `${c.ano}:${c.uf}:${c.cargoCodigo}:${c.numero}`;
}

/**
 * O que o seletor mostra: turno e cargo escolhidos, busca por nome ou
 * numero; os favoritos primeiro, depois do mais votado para o menos votado.
 * Legenda, branco e nulo so entram quando pedidos — quem procura "quem eu
 * quiser" procura gente.
 */
export function filtrarCandidatos(
  lista: readonly CandidatoDaVotacao[],
  filtro: {
    turno: number | null;
    cargoCodigo: number | null;
    busca: string;
    todos?: boolean;
    favoritos?: ReadonlySet<string>;
    soFavoritos?: boolean;
  },
): CandidatoDaVotacao[] {
  const busca = paraBusca(filtro.busca);
  const favorito = (c: CandidatoDaVotacao) => Boolean(filtro.favoritos?.has(chaveDoFavorito(c)));
  return lista
    .filter((c) => (filtro.soFavoritos ? favorito(c) : true))
    .filter((c) => (filtro.todos || filtro.soFavoritos ? true : c.tipo === 'CANDIDATO'))
    .filter((c) => filtro.turno === null || c.turno === filtro.turno)
    .filter((c) => filtro.cargoCodigo === null || c.cargoCodigo === filtro.cargoCodigo)
    .filter((c) => !busca || paraBusca(c.nome).includes(busca) || c.numero.startsWith(busca))
    .sort(
      (a, b) =>
        Number(favorito(b)) - Number(favorito(a)) || b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'),
    );
}

/** Os cargos que vieram na planilha, na ordem do TSE. */
export function cargosDaVotacao(lista: readonly CandidatoDaVotacao[]): { codigo: number; nome: string }[] {
  const porCodigo = new Map<number, string>();
  for (const c of lista) if (!porCodigo.has(c.cargoCodigo)) porCodigo.set(c.cargoCodigo, c.cargo);
  return [...porCodigo.entries()].sort((a, b) => a[0] - b[0]).map(([codigo, nome]) => ({ codigo, nome }));
}

/**
 * Os dois numeros do candidato, sem esconder a diferenca:
 * "1.234 votos contados nas seções · 5.678 no total do TSE (22% já no mapa)".
 *
 * Na apuracao, o TSE soma o estado antes de publicar o boletim de cada
 * secao; o mapa so pode mostrar o que ja veio por secao. Por isso o total
 * oficial anda na frente ate a apuracao terminar.
 */
export function textoDosTotais(c: Pick<CandidatoDaVotacao, 'total' | 'totalOficial'>): string {
  const n = (v: number) => v.toLocaleString('pt-BR');
  if (c.totalOficial === null || c.totalOficial <= 0) return `${n(c.total)} votos`;
  if (c.total >= c.totalOficial) return `${n(c.total)} votos (todos já no mapa)`;
  const pct = Math.floor((c.total / c.totalOficial) * 100);
  return `${n(c.total)} votos contados nas seções · ${n(c.totalOficial)} no total do TSE (${pct}% já no mapa)`;
}

/** Foto oficial do candidato pelo numero de urna (o servidor busca no TSE). */
export function fotoDoCandidatoUrl(c: Pick<CandidatoDaVotacao, 'cargoCodigo' | 'numero' | 'ano' | 'sqcand'>): string {
  if (c.sqcand) return `/api/votacao/foto/${c.cargoCodigo}/${encodeURIComponent(c.sqcand)}`;
  return `/api/votacao/foto/${c.cargoCodigo}/numero/${encodeURIComponent(c.numero)}?ano=${c.ano}`;
}
