import type { PollingPlacePin } from './map-pin';
import { sectionKey } from './map-pin';

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
