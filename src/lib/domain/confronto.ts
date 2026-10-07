import type { PollingPlacePin } from './map-pin';
import { sectionKey } from './map-pin';
import { referenciaDoLider } from './map-filters';

/**
 * Estimativa x apuracao: o que o time esperava em cada escola, e o que o
 * candidato teve la.
 *
 * Modulo puro. De um lado, os pinos de escola da CAMPANHA (a estimativa:
 * uma pessoa cadastrada que vota ali, um voto). Do outro, os pinos da
 * VOTACAO do candidato (votos apurados pelo TSE, secao por secao). O
 * resultado e uma lista de escolas com as duas contas lado a lado — escola,
 * zona e secao.
 *
 * COMO AS ESCOLAS SE ENCONTRAM. Pela secao: cada secao funciona em uma
 * escola so, entao zona + secao igual e a mesma escola, sem duvida. Quando a
 * secao nao resolve (cadastro sem secao), vale a escola no mesmo ponto do
 * mapa com o mesmo nome.
 *
 * Escola com estimativa e zero voto TAMBEM entra: e, muitas vezes, a
 * informacao mais importante da noite.
 */

export interface SecaoNoConfronto {
  /** Normalizadas, sem zero a esquerda. Nulas na linha "sem zona/secao". */
  zona: string | null;
  secao: string | null;
  estimativa: number;
  apurado: number;
}

export interface EscolaNoConfronto {
  /** Identificador estavel: o pino da votacao, senao o da campanha. */
  chave: string;
  titulo: string;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  latitude: number;
  longitude: number;
  /** Tem ponto utilizavel no mapa. */
  noMapa: boolean;
  /** Pinos da campanha que caem aqui: e por eles que se abre "Ver pessoas". */
  pinosDaCampanha: string[];
  estimativa: number;
  apurado: number;
  secoes: SecaoNoConfronto[];
}

export interface Confronto {
  escolas: EscolaNoConfronto[];
  /** Escolas onde o time tinha estimativa. */
  doTime: EscolaNoConfronto[];
  estimativaTotal: number;
  /** Votos do candidato nas escolas onde o time tinha estimativa. */
  apuradoNasEscolasDoTime: number;
  /** Todos os votos do candidato no recorte. */
  apuradoTotal: number;
}

const limpar = (v: string | null | undefined) => {
  const t = (v ?? '').trim().replace(/^0+(?=\d)/, '');
  return t || null;
};

const titulo = (t: string | null | undefined) =>
  (t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

const temPonto = (p: Pick<PollingPlacePin, 'latitude' | 'longitude'>) =>
  Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && !(p.latitude === 0 && p.longitude === 0);

/** Mesmo ponto (ate ~60 m) e mesmo nome: a mesma escola. */
function mesmoLugar(a: PollingPlacePin, b: PollingPlacePin): boolean {
  if (!temPonto(a) || !temPonto(b)) return false;
  const perto = Math.abs(a.latitude - b.latitude) < 0.0006 && Math.abs(a.longitude - b.longitude) < 0.0006;
  return perto && titulo(a.title) !== '' && titulo(a.title) === titulo(b.title);
}

export function confrontar(campanha: readonly PollingPlacePin[], votacao: readonly PollingPlacePin[]): Confronto {
  // Secao -> escola da votacao.
  const escolaDaSecao = new Map<string, PollingPlacePin>();
  for (const pin of votacao) {
    for (const s of pin.sections) if (s.zone && s.section) escolaDaSecao.set(sectionKey(s), pin);
  }

  interface Grupo {
    votacao: PollingPlacePin | null;
    campanha: PollingPlacePin[];
  }
  const grupos = new Map<string, Grupo>();
  for (const pin of votacao) grupos.set(pin.locationId, { votacao: pin, campanha: [] });

  for (const pin of campanha) {
    if (pin.total <= 0) continue;
    // A secao manda; na falta dela, o lugar e o nome.
    const pelaSecao = pin.sections
      .filter((s) => s.zone && s.section)
      .map((s) => escolaDaSecao.get(sectionKey(s)))
      .find(Boolean);
    const destino = pelaSecao ?? votacao.find((v) => mesmoLugar(v, pin)) ?? null;
    const chave = destino?.locationId ?? `campanha:${pin.locationId}`;
    const grupo = grupos.get(chave) ?? { votacao: null, campanha: [] };
    grupo.campanha.push(pin);
    grupos.set(chave, grupo);
  }

  const escolas: EscolaNoConfronto[] = [];
  for (const [chave, g] of grupos) {
    const porSecao = new Map<string, SecaoNoConfronto>();
    const somar = (s: { zone: string | null; section: string | null; total: number }, campo: 'estimativa' | 'apurado') => {
      const k = sectionKey(s);
      const linha = porSecao.get(k) ?? { zona: limpar(s.zone), secao: limpar(s.section), estimativa: 0, apurado: 0 };
      linha[campo] += s.total;
      porSecao.set(k, linha);
    };
    for (const s of g.votacao?.sections ?? []) somar(s, 'apurado');
    for (const pin of g.campanha) for (const s of pin.sections) somar(s, 'estimativa');

    const estimativa = g.campanha.reduce((t, p) => t + p.total, 0);
    const apurado = g.votacao?.total ?? 0;
    if (estimativa === 0 && apurado === 0) continue;

    // O ponto: o da campanha (geocodificado) ou o da votacao, o que existir.
    const comPonto = [...g.campanha, ...(g.votacao ? [g.votacao] : [])].find(temPonto) ?? null;
    const base = g.campanha[0] ?? g.votacao!;
    escolas.push({
      chave,
      titulo: base.title ?? g.votacao?.title ?? 'Local de votação',
      endereco: base.address ?? g.votacao?.address ?? null,
      cidade: base.city ?? g.votacao?.city ?? null,
      uf: base.state ?? g.votacao?.state ?? null,
      latitude: comPonto?.latitude ?? 0,
      longitude: comPonto?.longitude ?? 0,
      noMapa: comPonto !== null,
      pinosDaCampanha: g.campanha.map((p) => p.locationId),
      estimativa,
      apurado,
      secoes: [...porSecao.values()].sort(
        (a, b) =>
          Number(!a.zona && !a.secao) - Number(!b.zona && !b.secao) ||
          (a.zona ?? '').localeCompare(b.zona ?? '', 'pt-BR', { numeric: true }) ||
          (a.secao ?? '').localeCompare(b.secao ?? '', 'pt-BR', { numeric: true }),
      ),
    });
  }

  escolas.sort((a, b) => b.estimativa - a.estimativa || b.apurado - a.apurado || a.titulo.localeCompare(b.titulo, 'pt-BR'));
  const doTime = escolas.filter((e) => e.estimativa > 0);
  return {
    escolas,
    doTime,
    estimativaTotal: doTime.reduce((t, e) => t + e.estimativa, 0),
    apuradoNasEscolasDoTime: doTime.reduce((t, e) => t + e.apurado, 0),
    apuradoTotal: escolas.reduce((t, e) => t + e.apurado, 0),
  };
}

/**
 * Votos apurados para cada voto estimado, em porcentagem (pode passar de
 * 100%: o candidato tem voto de quem nao esta no cadastro). Nulo sem
 * estimativa.
 */
export function conversao(e: Pick<EscolaNoConfronto, 'estimativa' | 'apurado'>): number | null {
  return e.estimativa > 0 ? (e.apurado / e.estimativa) * 100 : null;
}

export type LeituraDoConfronto = 'ACIMA' | 'PERTO' | 'ABAIXO' | 'ZERADA' | 'SEM_ESTIMATIVA';

/**
 * Leitura de uma escola ou secao: superou a estimativa, ficou perto (80% a
 * 100%), ficou abaixo, ou zerou — o time tinha gente ali e o candidato nao
 * teve nenhum voto.
 */
export function leitura(e: Pick<EscolaNoConfronto, 'estimativa' | 'apurado'>): LeituraDoConfronto {
  if (e.estimativa <= 0) return 'SEM_ESTIMATIVA';
  if (e.apurado <= 0) return 'ZERADA';
  const c = (e.apurado / e.estimativa) * 100;
  if (c >= 100) return 'ACIMA';
  if (c >= 80) return 'PERTO';
  return 'ABAIXO';
}

/**
 * As escolas do confronto como pinos do mapa da votacao. O numero do pino
 * e o APURADO (e o que o mapa da votacao mostra); a escola do time com zero
 * voto entra com zero — ela precisa aparecer.
 */
export function pinosDoConfronto(c: Confronto): { noMapa: PollingPlacePin[]; foraDoMapa: PollingPlacePin[] } {
  const pino = (e: EscolaNoConfronto): PollingPlacePin => ({
    locationId: e.chave,
    latitude: e.latitude,
    longitude: e.longitude,
    title: e.titulo,
    address: e.endereco,
    city: e.cidade,
    state: e.uf,
    imageUrl: null,
    total: e.apurado,
    men: 0,
    women: 0,
    others: e.apurado,
    sections: e.secoes.filter((s) => s.apurado > 0).map((s) => ({ zone: s.zona, section: s.secao, total: s.apurado })),
  });
  return {
    noMapa: c.escolas.filter((e) => e.noMapa).map(pino),
    foraDoMapa: c.escolas.filter((e) => !e.noMapa).map(pino),
  };
}

/** O confronto so com as escolas do recorte do mapa (zona, cidade...). */
export function recortar(c: Confronto, chaves: ReadonlySet<string>): Confronto {
  const escolas = c.escolas.filter((e) => chaves.has(e.chave));
  const doTime = escolas.filter((e) => e.estimativa > 0);
  return {
    escolas,
    doTime,
    estimativaTotal: doTime.reduce((t, e) => t + e.estimativa, 0),
    apuradoNasEscolasDoTime: doTime.reduce((t, e) => t + e.apurado, 0),
    apuradoTotal: escolas.reduce((t, e) => t + e.apurado, 0),
  };
}

/* -------------------------------------------------------------------------
   Os lideres em cada escola
   ------------------------------------------------------------------------- */

/** Uma pessoa da escola, como a lista "Ver pessoas" traz. */
export interface PessoaDaEscola {
  nome: string;
  zona: string | null;
  secao: string | null;
  /** Lider de quem e da Equipe. */
  lider: string | null;
  ehLider: boolean;
}

export interface SecaoDoLider {
  zona: string | null;
  secao: string | null;
  /** Pessoas que o lider cadastrou nesta secao. */
  cadastrados: number;
  /** Votos do candidato na secao inteira. */
  apurado: number;
}

export interface LiderNaEscola {
  /** "JOSÉ DA SILVA"; quem e Lider e vota aqui conta como dele mesmo. */
  lider: string;
  cadastrados: number;
  secoes: SecaoDoLider[];
  /** Pessoas dele sem zona/secao no cadastro: nao da para comparar. */
  semSecao: number;
  /**
   * O maximo de pessoas dele que podem ter votado no candidato: em cada
   * secao, o menor entre o que ele cadastrou e os votos da secao. O voto e
   * secreto — o numero exato ninguem sabe; o teto e certo.
   */
  noMaximo: number;
  /** Pessoas dele com secao que, pela conta, nao podem ter votado no candidato. */
  perda: number;
}

const SEM_LIDER = 'Sem líder informado';

/**
 * Agrupa as pessoas da escola pelo Lider, secao por secao, e calcula o teto
 * de quem pode ter votado no candidato. Do maior cadastro para o menor.
 */
export function lideresDaEscola(escola: Pick<EscolaNoConfronto, 'secoes'>, pessoas: readonly PessoaDaEscola[]): LiderNaEscola[] {
  const apuradoDa = new Map(
    escola.secoes.filter((s) => s.zona && s.secao).map((s) => [`${s.zona}/${s.secao}`, s.apurado]),
  );
  const porLider = new Map<string, { secoes: Map<string, SecaoDoLider>; semSecao: number; total: number }>();

  for (const p of pessoas) {
    const nome = p.lider?.trim() || (p.ehLider ? `${p.nome} (Líder)` : SEM_LIDER);
    const atual = porLider.get(nome) ?? { secoes: new Map(), semSecao: 0, total: 0 };
    atual.total += 1;
    const zona = limpar(p.zona);
    const secao = limpar(p.secao);
    if (!zona || !secao) atual.semSecao += 1;
    else {
      const k = `${zona}/${secao}`;
      const linha = atual.secoes.get(k) ?? { zona, secao, cadastrados: 0, apurado: apuradoDa.get(k) ?? 0 };
      linha.cadastrados += 1;
      atual.secoes.set(k, linha);
    }
    porLider.set(nome, atual);
  }

  return [...porLider.entries()]
    .map(([lider, d]) => {
      const secoes = [...d.secoes.values()].sort(
        (a, b) =>
          (a.zona ?? '').localeCompare(b.zona ?? '', 'pt-BR', { numeric: true }) ||
          (a.secao ?? '').localeCompare(b.secao ?? '', 'pt-BR', { numeric: true }),
      );
      const comSecao = secoes.reduce((t, s) => t + s.cadastrados, 0);
      const noMaximo = secoes.reduce((t, s) => t + Math.min(s.cadastrados, s.apurado), 0);
      return { lider, cadastrados: d.total, secoes, semSecao: d.semSecao, noMaximo, perda: comSecao - noMaximo };
    })
    .sort((a, b) => b.cadastrados - a.cadastrados || a.lider.localeCompare(b.lider, 'pt-BR'));
}

/**
 * A frase do lider na escola, quando os votos ficaram abaixo do que ele
 * cadastrou: "JOSÉ cadastrou 5 pessoas nesta escola (5 na seção 96). Nessa
 * seção o candidato teve 3 votos: no máximo 3 das 5 votaram nele."
 */
export function fraseDoLider(l: LiderNaEscola, candidato: string): string | null {
  if (l.perda <= 0 || l.secoes.length === 0) return null;
  const n = (v: number) => v.toLocaleString('pt-BR');
  const pessoas = (v: number) => `${n(v)} ${v === 1 ? 'pessoa' : 'pessoas'}`;
  const porSecao = l.secoes.map((s) => `${n(s.cadastrados)} na seção ${s.secao}`).join(', ');
  const comSecao = l.cadastrados - l.semSecao;
  const votos = l.secoes.reduce((t, s) => t + s.apurado, 0);
  const onde = l.secoes.length === 1 ? 'Nessa seção' : 'Nessas seções';
  return (
    `${l.lider} cadastrou ${pessoas(l.cadastrados)} nesta escola (${porSecao}). ` +
    `${onde} ${candidato} teve ${n(votos)} ${votos === 1 ? 'voto' : 'votos'}: ` +
    `no máximo ${n(l.noMaximo)} das ${n(comSecao)} votaram nele.`
  );
}

/** Os lideres do time inteiro: somados escola a escola, da maior perda para a menor. */
export function lideresDoTime(porEscola: readonly LiderNaEscola[][]): (Omit<LiderNaEscola, 'secoes'> & { escolas: number })[] {
  const soma = new Map<string, Omit<LiderNaEscola, 'secoes'> & { escolas: number }>();
  for (const escola of porEscola) {
    for (const l of escola) {
      const atual = soma.get(l.lider) ?? { lider: l.lider, cadastrados: 0, semSecao: 0, noMaximo: 0, perda: 0, escolas: 0 };
      atual.cadastrados += l.cadastrados;
      atual.semSecao += l.semSecao;
      atual.noMaximo += l.noMaximo;
      atual.perda += l.perda;
      atual.escolas += 1;
      soma.set(l.lider, atual);
    }
  }
  return [...soma.values()].sort((a, b) => b.perda - a.perda || b.cadastrados - a.cadastrados);
}

/* -------------------------------------------------------------------------
   Lideres no raio-x da escola
   ------------------------------------------------------------------------- */

export interface LiderNoRaioX {
  /** Chave do Lider (`leaderKey`). */
  id: string;
  nome: string;
  /** Pessoas que ele cadastrou e que votam na escola. */
  cadastrados: number;
  /** Secao (`chaveDaSecao`) -> pessoas dele ali. */
  porSecao: Record<string, number>;
  /**
   * A referencia do Lider (a coluna da planilha). Nulo: ele nao tem. Ausente:
   * nao se sabe (o mapa geral nao traz referencias) — e a tag nao aparece.
   */
  referencia?: string | null;
}

/** A mesma chave de secao do confronto: zona e secao sem zero a esquerda. */
export const chaveDaSecao = (zona: string | null, secao: string | null) => sectionKey({ zone: zona, section: secao });

/**
 * Quem cadastrou a estimativa da escola: os Lideres dos pinos da campanha
 * que caem nela, somados (uma escola pode ter mais de um pino), do maior
 * cadastro para o menor. `diretos` fecha a conta com a estimativa: quem e
 * Lider (cadastrado pelo Administrador) ou nao tem Lider registrado.
 */
export function lideresNoRaioX(
  escola: Pick<EscolaNoConfronto, 'pinosDaCampanha' | 'estimativa'>,
  campanha: readonly PollingPlacePin[],
  /** As referencias dos Lideres do time (`MapOverviewPayload.referencias`). */
  referencias?: Readonly<Record<string, string>>,
): { lideres: LiderNoRaioX[]; diretos: number } {
  const pinos = new Set(escola.pinosDaCampanha);
  const porLider = new Map<string, LiderNoRaioX>();
  for (const pin of campanha) {
    if (!pinos.has(pin.locationId)) continue;
    for (const l of pin.leaders ?? []) {
      const atual = porLider.get(l.id) ?? {
        id: l.id,
        nome: l.name,
        cadastrados: 0,
        porSecao: {},
        ...(referencias ? { referencia: referenciaDoLider(referencias, l) } : {}),
      };
      atual.cadastrados += l.total;
      for (const s of l.sections) {
        const k = chaveDaSecao(s.zone, s.section);
        atual.porSecao[k] = (atual.porSecao[k] ?? 0) + s.total;
      }
      porLider.set(l.id, atual);
    }
  }
  const lideres = [...porLider.values()].sort(
    (a, b) => b.cadastrados - a.cadastrados || a.nome.localeCompare(b.nome, 'pt-BR'),
  );
  const somados = lideres.reduce((t, l) => t + l.cadastrados, 0);
  return { lideres, diretos: Math.max(0, escola.estimativa - somados) };
}

/* -------------------------------------------------------------------------
   Varios candidatos de uma vez
   ------------------------------------------------------------------------- */

export interface SecaoNoComparativo {
  zona: string | null;
  secao: string | null;
  estimativa: number;
  /** Votos de cada candidato na secao, na ordem dos candidatos. */
  apurado: number[];
}

export interface EscolaNoComparativo extends Omit<EscolaNoConfronto, 'apurado' | 'secoes'> {
  apurado: number[];
  secoes: SecaoNoComparativo[];
}

export interface Comparativo {
  /** As escolas do time, da maior estimativa para a menor. */
  escolas: EscolaNoComparativo[];
  estimativaTotal: number;
  /** Votos de cada candidato nas escolas do time. */
  apuradoNasEscolasDoTime: number[];
  /** Votos de cada candidato no recorte inteiro. */
  apuradoTotal: number[];
}

/**
 * O mesmo time contra varios candidatos (a dobradinha de federal e estadual,
 * por exemplo): a estimativa e uma so — as pessoas cadastradas que votam na
 * escola —, e cada candidato tem o proprio apurado, escola, zona e secao.
 *
 * As escolas saem do confronto do primeiro candidato. Os votos dos outros
 * entram pela secao (zona e secao sao unicas no estado), e as secoes que so
 * eles tem na escola entram pelos pinos da campanha que as duas escolas
 * dividem. Assim nenhum voto conta duas vezes.
 */
export function compararCandidatos(confrontos: readonly Confronto[]): Comparativo {
  const n = confrontos.length;
  if (n === 0) return { escolas: [], estimativaTotal: 0, apuradoNasEscolasDoTime: [], apuradoTotal: [] };

  // Secao -> votos, candidato a candidato (o recorte inteiro).
  const votosDa = confrontos.map((c) => {
    const m = new Map<string, number>();
    for (const e of c.escolas) for (const s of e.secoes) if (s.zona || s.secao) m.set(chaveDaSecao(s.zona, s.secao), s.apurado);
    return m;
  });

  const escolas = confrontos[0].doTime.map((base): EscolaNoComparativo => {
    const pinos = new Set(base.pinosDaCampanha);
    const linhas = new Map<string, SecaoNoComparativo>();
    const linha = (zona: string | null, secao: string | null) => {
      const k = chaveDaSecao(zona, secao);
      const atual = linhas.get(k) ?? { zona, secao, estimativa: 0, apurado: Array<number>(n).fill(0) };
      linhas.set(k, atual);
      return atual;
    };
    for (const s of base.secoes) linha(s.zona, s.secao).estimativa = s.estimativa;
    // Secoes da mesma escola que so os outros candidatos tem.
    confrontos.slice(1).forEach((c) => {
      for (const e of c.escolas) {
        if (!e.pinosDaCampanha.some((p) => pinos.has(p))) continue;
        for (const s of e.secoes) {
          const l = linha(s.zona, s.secao);
          l.estimativa = Math.max(l.estimativa, s.estimativa);
        }
      }
    });
    for (const l of linhas.values()) {
      if (!l.zona && !l.secao) continue;
      const k = chaveDaSecao(l.zona, l.secao);
      l.apurado = votosDa.map((m) => m.get(k) ?? 0);
    }
    const secoes = [...linhas.values()].sort((a, b) => {
      const semA = !a.zona && !a.secao;
      const semB = !b.zona && !b.secao;
      if (semA !== semB) return semA ? 1 : -1;
      return (
        (a.zona ?? '').localeCompare(b.zona ?? '', 'pt-BR', { numeric: true }) ||
        (a.secao ?? '').localeCompare(b.secao ?? '', 'pt-BR', { numeric: true })
      );
    });
    return {
      ...base,
      secoes,
      apurado: Array.from({ length: n }, (_, i) => secoes.reduce((t, s) => t + s.apurado[i], 0)),
    };
  });

  return {
    escolas,
    estimativaTotal: escolas.reduce((t, e) => t + e.estimativa, 0),
    apuradoNasEscolasDoTime: Array.from({ length: n }, (_, i) => escolas.reduce((t, e) => t + e.apurado[i], 0)),
    apuradoTotal: confrontos.map((c) => c.apuradoTotal),
  };
}

/** Um candidato so, no mesmo formato do comparativo (o raio-x e o PDF leem um formato). */
export function comoComparativo(e: EscolaNoConfronto): EscolaNoComparativo {
  return { ...e, apurado: [e.apurado], secoes: e.secoes.map((s) => ({ ...s, apurado: [s.apurado] })) };
}
