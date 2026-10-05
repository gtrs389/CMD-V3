/**
 * Os arquivos publicos da apuracao do TSE (resultados.tse.jus.br).
 *
 * Modulo puro: monta os enderecos e le os JSON. Quem busca e o servidor
 * (`votacao-ao-vivo.service.ts`), com poucas requisicoes por vez.
 *
 * O caminho de cada secao:
 *
 *   lista das secoes da UF   arquivo-urna/<pleito>/config/<uf>/<uf>-p<pleito>-cs.json
 *   situacao da secao        arquivo-urna/<pleito>/dados/<uf>/<mun>/<zona>/<secao>/p<pleito>-<uf>-m<mun>-z<zona>-s<secao>-aux.json
 *   boletim de urna          arquivo-urna/<pleito>/dados/<uf>/<mun>/<zona>/<secao>/<hash>/<arquivo .bu>
 *   nomes dos candidatos     <eleicao>/dados/<uf>/<uf>-c<cargo>-e<eleicao>-u.json
 *
 * O "pleito" e o dia de votacao (1o turno, 2o turno); a "eleicao" separa a
 * federal (Presidente) da estadual (Governador, Senador, Deputados).
 */

export interface ConfiguracaoDaApuracao {
  base: string;
  ano: number;
  turno: number;
  pleito: number;
  /** Eleicao federal: Presidente. */
  eleicaoFederal: number;
  /** Eleicao estadual: Governador, Senador, Deputados. */
  eleicaoEstadual: number;
}

/** 1o turno de 2026, como o TSE publicou. O 2o turno tem outros codigos. */
export const APURACAO_2026_1T: ConfiguracaoDaApuracao = {
  base: 'https://resultados.tse.jus.br/oficial/ele2026',
  ano: 2026,
  turno: 1,
  pleito: 3220,
  eleicaoFederal: 6257,
  eleicaoEstadual: 6259,
};

/** Cargos de uma eleicao geral, e de qual eleicao cada um e. */
export const CARGOS_DA_APURACAO = [
  { codigo: 1, federal: true },
  { codigo: 3, federal: false },
  { codigo: 5, federal: false },
  { codigo: 6, federal: false },
  { codigo: 7, federal: false },
] as const;

const PROPORCIONAIS = new Set([6, 7, 8, 13]);

const zeros = (n: number | string, tam: number) => String(n).padStart(tam, '0');

export interface SecaoDaApuracao {
  /** Como o TSE escreve na URL: municipio com 5 digitos, zona e secao com 4. */
  municipio: string;
  zona: string;
  secao: string;
  /**
   * Quando o boletim chegou ao TSE ("04/10/2026 17:31:26"), pela propria
   * lista de secoes. Nulo: ainda nao chegou — nao adianta consultar.
   */
  chegada?: string | null;
}

export function urlDaListaDeSecoes(c: ConfiguracaoDaApuracao, uf: string): string {
  const u = uf.toLowerCase();
  return `${c.base}/arquivo-urna/${c.pleito}/config/${u}/${u}-p${zeros(c.pleito, 6)}-cs.json`;
}

function pastaDaSecao(c: ConfiguracaoDaApuracao, uf: string, s: SecaoDaApuracao): string {
  return `${c.base}/arquivo-urna/${c.pleito}/dados/${uf.toLowerCase()}/${s.municipio}/${s.zona}/${s.secao}`;
}

export function urlDoAuxiliar(c: ConfiguracaoDaApuracao, uf: string, s: SecaoDaApuracao): string {
  const u = uf.toLowerCase();
  return `${pastaDaSecao(c, uf, s)}/p${zeros(c.pleito, 6)}-${u}-m${s.municipio}-z${s.zona}-s${s.secao}-aux.json`;
}

export function urlDoBoletim(c: ConfiguracaoDaApuracao, uf: string, s: SecaoDaApuracao, hash: string, arquivo: string): string {
  return `${pastaDaSecao(c, uf, s)}/${hash}/${arquivo}`;
}

export function urlDosCandidatos(c: ConfiguracaoDaApuracao, uf: string, cargo: number, federal: boolean): string {
  const u = uf.toLowerCase();
  const eleicao = federal ? c.eleicaoFederal : c.eleicaoEstadual;
  return `${c.base}/${eleicao}/dados/${u}/${u}-c${zeros(cargo, 4)}-e${zeros(eleicao, 6)}-u.json`;
}

/* -------------------------------------------------------------------------
   Leitura dos JSON
   ------------------------------------------------------------------------- */

type Json = Record<string, unknown>;
const lista = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const texto = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

/**
 * Todas as secoes da UF, como a lista do TSE traz (abr -> mu -> zon -> sec),
 * com o sinal de chegada do boletim (da/ha).
 *
 * Secao AGREGADA (listada em `nsa` de outra) fica de fora: os eleitores dela
 * votam na urna da principal, e boletim proprio nunca vai existir —
 * consulta-la seria so acumular 404 no TSE.
 */
export function secoesDaLista(json: unknown): SecaoDaApuracao[] {
  const secoes: SecaoDaApuracao[] = [];
  for (const abrangencia of lista((json as Json)?.abr)) {
    for (const municipio of lista(abrangencia.mu)) {
      for (const zona of lista(municipio.zon)) {
        const agregadas = new Set(
          lista(zona.sec).flatMap((s) => (Array.isArray(s.nsa) ? (s.nsa as unknown[]).map((n) => Number(texto(n))) : [])),
        );
        for (const secao of lista(zona.sec)) {
          const ns = texto(secao.ns);
          if (!texto(municipio.cd) || !texto(zona.cd) || !ns || agregadas.has(Number(ns))) continue;
          const chegada = `${texto(secao.da)} ${texto(secao.ha)}`.trim() || null;
          secoes.push({ municipio: texto(municipio.cd), zona: texto(zona.cd), secao: ns, chegada });
        }
      }
    }
  }
  return secoes;
}

export interface BoletimPublicado {
  hash: string;
  arquivo: string;
  situacao: string;
  /** "04/10/2026 17:31:26", quando o TSE recebeu. */
  recebido: string;
}

/**
 * O boletim publicado no arquivo auxiliar da secao, ou nulo se ainda nao ha.
 *
 * Em 2026 cada hash traz `arq: [{nm, tp}]`; em 2022 trazia `nmarq: [nomes]`.
 * Os dois sao aceitos. Havendo mais de um boletim, vale o totalizado.
 */
export function boletimDoAuxiliar(json: unknown): BoletimPublicado | null {
  const candidatos = lista((json as Json)?.hashes)
    .map((h) => {
      const arquivos = [
        ...lista(h.arq).filter((a) => texto(a.tp) === 'bu').map((a) => texto(a.nm)),
        ...(Array.isArray(h.nmarq) ? (h.nmarq as unknown[]).map(texto) : []).filter((nome) => /\.bu$/i.test(nome)),
      ].filter(Boolean);
      return {
        hash: texto(h.hash),
        arquivo: arquivos[0] ?? '',
        situacao: texto(h.st),
        recebido: `${texto(h.dr)} ${texto(h.hr)}`.trim(),
      };
    })
    .filter((h) => h.hash && h.arquivo);
  if (candidatos.length === 0) return null;
  return candidatos.find((h) => /totaliz/i.test(h.situacao)) ?? candidatos[candidatos.length - 1];
}

export interface NomeNaApuracao {
  cargo: number;
  numero: string;
  nome: string;
  partido: string | null;
  tipo: 'CANDIDATO' | 'LEGENDA';
  /**
   * Total oficial no estado, como o TSE divulga (vap): o numero que os
   * paineis de apuracao mostram. Nulo quando o arquivo nao traz.
   */
  votosOficiais: number | null;
}

/** "1.234", "1234" ou 1234 -> 1234. Vazio ou estranho -> nulo. */
function votos(v: unknown): number | null {
  const digitos = texto(v).replace(/\D/g, '');
  return digitos ? Number(digitos) : null;
}

/**
 * Nomes de um cargo (carg -> agr -> par -> cand). Nos cargos proporcionais
 * o partido tambem entra, com o proprio numero: e o nome do voto de legenda.
 */
export function nomesDoCargo(json: unknown, cargo: number): NomeNaApuracao[] {
  const nomes = new Map<string, NomeNaApuracao>();
  for (const c of lista((json as Json)?.carg)) {
    for (const agremiacao of lista(c.agr)) {
      for (const partido of lista(agremiacao.par)) {
        const sigla = texto(partido.sg) || null;
        const numeroDoPartido = texto(partido.n);
        if (PROPORCIONAIS.has(cargo) && numeroDoPartido && sigla) {
          nomes.set(numeroDoPartido, {
            cargo,
            numero: numeroDoPartido,
            nome: sigla,
            partido: sigla,
            tipo: 'LEGENDA',
            votosOficiais: votos(partido.vl ?? partido.vap),
          });
        }
        for (const candidato of lista(partido.cand)) {
          const numero = texto(candidato.n);
          const nome = texto(candidato.nmu) || texto(candidato.nm);
          if (!numero || !nome) continue;
          nomes.set(numero, { cargo, numero, nome, partido: sigla, tipo: 'CANDIDATO', votosOficiais: votos(candidato.vap) });
        }
      }
    }
  }
  return [...nomes.values()];
}

/** Foto oficial do candidato: `<eleicao>/fotos/<uf>/<sqcand>.jpeg`. */
export function urlDaFoto(c: ConfiguracaoDaApuracao, uf: string, federal: boolean, sqcand: string): string {
  const eleicao = federal ? c.eleicaoFederal : c.eleicaoEstadual;
  return `${c.base}/${eleicao}/fotos/${uf.toLowerCase()}/${sqcand}.jpeg`;
}
