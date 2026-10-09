import type { PollingPlacePin } from './map-pin';
import { chaveDaSecao } from './confronto';
import { PREFIXO_DA_VOTACAO, type LocalDoTse, type SecaoDoLocal, type VotoNaSecao } from './votacao-tse';

/**
 * Secoes zeradas: TODAS as secoes das escolas de um municipio, com os votos
 * de cada candidato escolhido — inclusive o zero.
 *
 * A votacao de um candidato so guarda onde ele teve voto (a planilha do TSE
 * nao tem linha de zero), entao o zero so aparece contra a lista completa de
 * secoes do municipio. Junto, quem do time vota ali: quantas pessoas cada
 * Lider cadastrou na escola e em cada secao. Secao zerada com gente do time e
 * o alarme — tinha voto prometido e nao veio nenhum.
 */

/** Sem acento nem caixa: "Palmeira dos Índios" e "PALMEIRA DOS INDIOS" sao um so. */
export const municipioParaComparar = (texto: string | null | undefined) =>
  (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * O filtro `ilike` do banco para um municipio: cada letra fora do ASCII vira
 * `_` (um caractere qualquer), para o acento nao separar "Índios" de "INDIOS".
 * O resultado ainda passa por `municipioParaComparar`.
 */
export function padraoDoMunicipio(nome: string): string {
  return nome
    .trim()
    .replace(/[*,()%\\]/g, '_')
    .replace(/[^\x20-\x7e]/g, '_');
}

export interface SecaoDoMunicipio {
  zona: string;
  secao: string;
  /** Votos de cada candidato, na ordem pedida (zero quando ele nao teve voto). */
  votos: number[];
}

export interface EscolaDoMunicipio {
  chave: string;
  titulo: string;
  endereco: string | null;
  cidade: string | null;
  secoes: SecaoDoMunicipio[];
}

export interface MunicipioComSecoes {
  /** O nome pedido (como o filtro do mapa escreve). */
  municipio: string;
  escolas: EscolaDoMunicipio[];
}

/** A resposta de `/api/votacao/secoes-zeradas`. */
export interface SecoesDoMunicipioPayload {
  /** Ids dos candidatos, na ordem dos votos de cada secao. */
  candidatos: string[];
  municipios: MunicipioComSecoes[];
}

const porNumero = (a: string, b: string) => Number(a) - Number(b) || a.localeCompare(b);

/**
 * As escolas de um municipio com todas as secoes e os votos de cada
 * candidato em cada uma. A escola sai do local de votacao (cmd_polling_places)
 * e, sem ele, do numero do local na planilha — a mesma chave das escolas da
 * votacao no mapa.
 */
export function escolasDoMunicipio(
  secoes: readonly SecaoDoLocal[],
  uf: string,
  locais: readonly LocalDoTse[],
  votosDosCandidatos: readonly (readonly VotoNaSecao[])[],
): EscolaDoMunicipio[] {
  const porSecao = new Map<string, LocalDoTse>();
  for (const local of locais) for (const s of local.sections) porSecao.set(`${local.zone}/${s}`, local);
  const votos = votosDosCandidatos.map((lista) => {
    const m = new Map<string, number>();
    for (const [zona, secao, n] of lista) m.set(`${zona}/${secao}`, (m.get(`${zona}/${secao}`) ?? 0) + n);
    return m;
  });

  const escolas = new Map<string, EscolaDoMunicipio>();
  const vistas = new Set<string>();
  for (const s of secoes) {
    const k = `${s.zone}/${s.section}`;
    if (vistas.has(k)) continue;
    vistas.add(k);
    const local = porSecao.get(k) ?? null;
    const chave = local
      ? `${PREFIXO_DA_VOTACAO}${local.id}`
      : `${PREFIXO_DA_VOTACAO}${uf}/${s.zone}/${s.place_number ?? s.place_name ?? `secao-${s.section}`}`;
    let escola = escolas.get(chave);
    if (!escola) {
      escola = {
        chave,
        titulo: local?.name ?? s.place_name ?? `Seção ${s.section}`,
        endereco: local?.address ?? s.place_address ?? null,
        cidade: s.city ?? local?.city ?? null,
        secoes: [],
      };
      escolas.set(chave, escola);
    }
    escola.secoes.push({ zona: String(s.zone), secao: String(s.section), votos: votos.map((m) => Math.max(0, m.get(k) ?? 0)) });
  }

  for (const e of escolas.values()) e.secoes.sort((a, b) => porNumero(a.zona, b.zona) || porNumero(a.secao, b.secao));
  return [...escolas.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

/* -------------------------------------------------------------------------
   O relatorio
   ------------------------------------------------------------------------- */

/** TODOS: so a secao onde nenhum dos escolhidos teve voto. ALGUM: onde ao menos um zerou. */
export type ModoDasZeradas = 'TODOS' | 'ALGUM';

export interface LiderNaZerada {
  id: string;
  nome: string;
  pessoas: number;
}

export interface SecaoZerada extends SecaoDoMunicipio {
  chave: string;
  /** Quem zerou ali (indices dos candidatos). */
  zeraram: number[];
  /** Pessoas do time que votam na secao (todas, com ou sem Lider). */
  gente: number;
  /** Quanto cada Lider cadastrou na secao, do maior para o menor. */
  lideres: LiderNaZerada[];
}

export interface EscolaComZeradas {
  chave: string;
  titulo: string;
  endereco: string | null;
  cidade: string | null;
  zonas: string[];
  /** Secoes da escola (todas) e as zeradas, na ordem de zona e secao. */
  totalDeSecoes: number;
  zeradas: SecaoZerada[];
  /** Pessoas do time na escola inteira e so nas secoes zeradas. */
  genteNaEscola: number;
  genteNasZeradas: number;
  /** Quanto cada Lider cadastrou na escola (todas as secoes), do maior para o menor. */
  lideres: (LiderNaZerada & { nasZeradas: number })[];
  /** Votos de cada candidato na escola inteira (para o contraste: zerou aqui, teve ali). */
  votosNaEscola: number[];
}

export interface LiderNoRelatorio {
  id: string;
  nome: string;
  /** Pessoas dele nas secoes zeradas. */
  nasZeradas: number;
  /** Secoes zeradas e escolas onde ele tem gente. */
  secoes: number;
  escolas: number;
}

export interface RelatorioDeZeradas {
  municipios: string[];
  modo: ModoDasZeradas;
  escolas: EscolaComZeradas[];
  totais: {
    escolasDoMunicipio: number;
    secoesDoMunicipio: number;
    escolasComZerada: number;
    secoesZeradas: number;
    /** Secoes zeradas onde o time tem gente: o alarme. */
    zeradasComGente: number;
    genteNasZeradas: number;
    /** Secoes zeradas por candidato (no modo ALGUM, cada um tem a sua conta). */
    zeradasPorCandidato: number[];
  };
  /** As secoes zeradas com mais gente do time, para a primeira pagina. */
  alarmes: (SecaoZerada & { escola: string })[];
  lideres: LiderNoRelatorio[];
}

const doMaiorParaOMenor = <T extends { pessoas: number; nome: string }>(a: T, b: T) =>
  b.pessoas - a.pessoas || a.nome.localeCompare(b.nome, 'pt-BR');

/**
 * As secoes zeradas das escolas, com a gente do time e os Lideres de cada
 * uma. Os pinos da campanha entram na escola pelas secoes (zona e secao) —
 * um pino da campanha "casa" com a escola quando vota numa secao dela —, e a
 * gente sem secao do pino conta na escola, nao numa secao.
 */
export function relatorioDeZeradas(
  payload: SecoesDoMunicipioPayload,
  campanha: readonly Pick<PollingPlacePin, 'total' | 'sections' | 'leaders'>[],
  modo: ModoDasZeradas = 'TODOS',
  /** Quantos alarmes vao para a primeira pagina. */
  limiteDeAlarmes = 15,
): RelatorioDeZeradas {
  const n = payload.candidatos.length;
  const zerou = (votos: number[]) => (modo === 'TODOS' ? votos.every((v) => v <= 0) : votos.some((v) => v <= 0));

  // Secao -> pinos da campanha que votam nela.
  const pinosDaSecao = new Map<string, Set<number>>();
  campanha.forEach((p, i) => {
    for (const s of p.sections) {
      if (!s.zone || !s.section || s.total <= 0) continue;
      const k = chaveDaSecao(s.zone, s.section);
      const set = pinosDaSecao.get(k) ?? new Set<number>();
      set.add(i);
      pinosDaSecao.set(k, set);
    }
  });

  const escolas: EscolaComZeradas[] = [];
  const porLider = new Map<string, { id: string; nome: string; nasZeradas: number; secoes: number; escolas: Set<string> }>();
  let escolasDoMunicipio = 0;
  let secoesDoMunicipio = 0;
  const zeradasPorCandidato = Array.from({ length: n }, () => 0);

  for (const m of payload.municipios) {
    for (const e of m.escolas) {
      escolasDoMunicipio += 1;
      secoesDoMunicipio += e.secoes.length;
      for (const s of e.secoes) s.votos.forEach((v, i) => v <= 0 && zeradasPorCandidato[i]++);

      const chaves = e.secoes.map((s) => chaveDaSecao(s.zona, s.secao));
      const daEscola = new Set(chaves);
      const pinos = new Set(chaves.flatMap((k) => [...(pinosDaSecao.get(k) ?? [])]));

      // A gente do time na escola: secao a secao, e o que o pino tem sem secao.
      const genteDaSecao = new Map<string, number>();
      const lideresDaSecao = new Map<string, Map<string, LiderNaZerada>>();
      const lideresDaEscola = new Map<string, LiderNaZerada & { nasZeradas: number }>();
      let genteNaEscola = 0;
      for (const i of pinos) {
        const p = campanha[i];
        for (const s of p.sections) {
          const k = chaveDaSecao(s.zone, s.section);
          if (daEscola.has(k)) {
            genteDaSecao.set(k, (genteDaSecao.get(k) ?? 0) + s.total);
            genteNaEscola += s.total;
          } else if (!s.zone || !s.section) {
            genteNaEscola += s.total;
          }
        }
        for (const l of p.leaders ?? []) {
          let naEscola = 0;
          for (const s of l.sections) {
            const k = chaveDaSecao(s.zone, s.section);
            if (daEscola.has(k)) {
              const m2 = lideresDaSecao.get(k) ?? new Map<string, LiderNaZerada>();
              const atual = m2.get(l.id) ?? { id: l.id, nome: l.name, pessoas: 0 };
              atual.pessoas += s.total;
              m2.set(l.id, atual);
              lideresDaSecao.set(k, m2);
              naEscola += s.total;
            } else if (!s.zone || !s.section) {
              naEscola += s.total;
            }
          }
          if (naEscola <= 0) continue;
          const atual = lideresDaEscola.get(l.id) ?? { id: l.id, nome: l.name, pessoas: 0, nasZeradas: 0 };
          atual.pessoas += naEscola;
          lideresDaEscola.set(l.id, atual);
        }
      }

      const zeradas: SecaoZerada[] = [];
      e.secoes.forEach((s, j) => {
        if (n === 0 || !zerou(s.votos)) return;
        const chave = chaves[j];
        const lideres = [...(lideresDaSecao.get(chave)?.values() ?? [])].sort(doMaiorParaOMenor);
        zeradas.push({
          ...s,
          chave,
          zeraram: s.votos.flatMap((v, i) => (v <= 0 ? [i] : [])),
          gente: genteDaSecao.get(chave) ?? 0,
          lideres,
        });
        for (const l of lideres) {
          const naEscola = lideresDaEscola.get(l.id);
          if (naEscola) naEscola.nasZeradas += l.pessoas;
          const geral = porLider.get(l.id) ?? { id: l.id, nome: l.nome, nasZeradas: 0, secoes: 0, escolas: new Set<string>() };
          geral.nasZeradas += l.pessoas;
          geral.secoes += 1;
          geral.escolas.add(e.chave);
          porLider.set(l.id, geral);
        }
      });
      if (zeradas.length === 0) continue;

      escolas.push({
        chave: e.chave,
        titulo: e.titulo,
        endereco: e.endereco,
        cidade: e.cidade,
        zonas: [...new Set(e.secoes.map((s) => s.zona))],
        totalDeSecoes: e.secoes.length,
        zeradas,
        genteNaEscola,
        genteNasZeradas: zeradas.reduce((t, s) => t + s.gente, 0),
        lideres: [...lideresDaEscola.values()].sort(doMaiorParaOMenor),
        votosNaEscola: Array.from({ length: n }, (_, i) => e.secoes.reduce((t, s) => t + (s.votos[i] ?? 0), 0)),
      });
    }
  }

  // Primeiro onde o time tinha mais gente e veio zero; depois, mais seções zeradas.
  escolas.sort(
    (a, b) =>
      b.genteNasZeradas - a.genteNasZeradas ||
      b.zeradas.length - a.zeradas.length ||
      a.titulo.localeCompare(b.titulo, 'pt-BR'),
  );

  const todasAsZeradas = escolas.flatMap((e) => e.zeradas.map((s) => ({ ...s, escola: e.titulo })));
  return {
    municipios: payload.municipios.map((m) => m.municipio),
    modo,
    escolas,
    totais: {
      escolasDoMunicipio,
      secoesDoMunicipio,
      escolasComZerada: escolas.length,
      secoesZeradas: todasAsZeradas.length,
      zeradasComGente: todasAsZeradas.filter((s) => s.gente > 0).length,
      genteNasZeradas: todasAsZeradas.reduce((t, s) => t + s.gente, 0),
      zeradasPorCandidato,
    },
    alarmes: todasAsZeradas
      .filter((s) => s.gente > 0)
      .sort((a, b) => b.gente - a.gente || porNumero(a.zona, b.zona) || porNumero(a.secao, b.secao))
      .slice(0, limiteDeAlarmes),
    lideres: [...porLider.values()]
      .map((l) => ({ id: l.id, nome: l.nome, nasZeradas: l.nasZeradas, secoes: l.secoes, escolas: l.escolas.size }))
      .sort((a, b) => b.nasZeradas - a.nasZeradas || a.nome.localeCompare(b.nome, 'pt-BR')),
  };
}
