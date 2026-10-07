import { matchesSearch, normalizeSearch } from '@/lib/utils/text';
import {
  filterPins,
  leaderKey,
  sectionKey,
  sectionLabel,
  type MapFilter,
  type MapOverviewPayload,
  type MapPin,
  type PollingPlacePin,
} from './map-pin';

/**
 * Filtros do mapa.
 *
 * Modulo puro: as mesmas regras valem na tela, no teste e em qualquer outro
 * lugar que precise recortar o mapa. Nada aqui depende do Leaflet, do React
 * ou de rede — o mapa apenas desenha o que este arquivo decide.
 *
 * A pergunta que o mapa tem de responder e "onde eu tenho mais voto", e ela
 * so faz sentido com recorte: em um estado, em uma cidade, em uma zona
 * eleitoral, acima de um tamanho minimo. Por isso o recorte vive aqui,
 * junto com a CONTAGEM que ele produz — se os dois morassem em lugares
 * diferentes, a lista e o mapa acabariam mostrando numeros distintos para o
 * mesmo filtro.
 */

export interface MapQuery {
  /** Pessoas, locais de votacao ou ambos. */
  kind: MapFilter;
  /** Busca livre: nome, escola, rua, bairro, cidade. */
  search: string;
  /** UF. Nulo significa "todas". */
  state: string | null;
  city: string | null;
  /**
   * Varios municipios de uma vez (a votacao no mapa): vale o local que
   * estiver em QUALQUER um deles. Vazio: todos.
   */
  cities: string[];
  /** Zona eleitoral. Recorta tambem a contagem de votos do local. */
  zone: string | null;
  /**
   * Uma secao eleitoral, pela chave `zona/secao` (`sectionKey`): a mesma
   * secao existe em varias zonas, entao a zona vai junto. O local passa a
   * contar so essa secao, e some do mapa onde ela nao existe.
   */
  section: string | null;
  /** Esconde local de votacao abaixo deste tamanho. */
  minVotes: number;
  /**
   * So as pessoas que este Lider cadastrou (chave de `leaderKey`). A escola
   * passa a contar so a Equipe dele, secao por secao, e some do mapa onde
   * ele nao cadastrou ninguem.
   */
  leader: string | null;
  /**
   * So as Equipes dos Lideres destas referencias (chaves de
   * `chaveDaReferenciaNoMapa`; `SEM_REFERENCIA_NO_MAPA` para os Lideres sem
   * nenhuma). Varias de uma vez: vale o Lider de QUALQUER uma. Como o filtro
   * de Lider, a escola passa a contar so a gente deles.
   */
  references: string[];
}

export const DEFAULT_MAP_QUERY: MapQuery = {
  kind: 'BOTH',
  search: '',
  state: null,
  city: null,
  cities: [],
  zone: null,
  section: null,
  minVotes: 0,
  leader: null,
  references: [],
};

/** A opcao dos Lideres sem referencia no filtro do mapa. */
export const SEM_REFERENCIA_NO_MAPA = '__sem-referencia__';

/** "ROBERVAL", "Roberval " e "robervál" sao a mesma referencia. */
export function chaveDaReferenciaNoMapa(texto: string | null | undefined): string {
  return normalizeSearch((texto ?? '').replace(/\s+/g, ' ').trim());
}

/** A referencia escrita do Lider (pela chave dele ou, sem usuario, pelo nome), ou nulo. */
export function referenciaDoLider(
  referencias: Readonly<Record<string, string>> | undefined,
  lider: { id: string; name: string },
): string | null {
  if (!referencias) return null;
  return referencias[lider.id] ?? referencias[leaderKey(null, lider.name) ?? ''] ?? null;
}

/**
 * Os Lideres (chaves) das referencias escolhidas, entre os que aparecem no
 * mapa — nas escolas ou nos pinos de moradia da Equipe.
 */
export function lideresDasReferencias(
  payload: Pick<MapOverviewPayload, 'pins' | 'pollingPlaces' | 'referencias'> | null | undefined,
  escolhidas: readonly string[],
): Set<string> {
  const alvo = new Set(escolhidas);
  const nomes = new Map<string, string>();
  for (const place of payload?.pollingPlaces ?? []) for (const l of place.leaders ?? []) nomes.set(l.id, l.name);
  for (const pin of payload?.pins ?? []) if (pin.leaderId && !nomes.has(pin.leaderId)) nomes.set(pin.leaderId, '');
  const lideres = new Set<string>();
  for (const [id, name] of nomes) {
    const chave = chaveDaReferenciaNoMapa(referenciaDoLider(payload?.referencias, { id, name }));
    if (alvo.has(chave || SEM_REFERENCIA_NO_MAPA)) lideres.add(id);
  }
  return lideres;
}

/** Cortes de tamanho oferecidos na tela. */
export const MIN_VOTES_STEPS = [0, 5, 10, 25, 50, 100] as const;

/**
 * Zona e secao sao TEXTO no cadastro: "07" e "7" sao a mesma zona escrita de
 * dois jeitos. Comparar sem normalizar faria o filtro perder metade dos
 * cadastros sem avisar ninguem.
 */
export function normalizeZone(value: string | null | undefined): string {
  const texto = (value ?? '').trim().replace(/^0+(?=\d)/, '');
  return texto.toUpperCase();
}

/* -------------------------------------------------------------------------
   Contagem
   ------------------------------------------------------------------------- */

/**
 * Votos do local DENTRO do recorte.
 *
 * Sem filtro de zona, e a estimativa inteira da escola. Com filtro, sao
 * apenas as secoes daquela zona — o numero exato que o cadastro fornece,
 * nunca uma divisao proporcional inventada. Uma escola que atende tres zonas
 * nao pode entrar no ranking de uma delas com o total das tres.
 */
export function placeVotes(place: PollingPlacePin, zone: string | null): number {
  if (!zone) return place.total;

  const alvo = normalizeZone(zone);
  return place.sections
    .filter((row) => normalizeZone(row.zone) === alvo)
    .reduce((soma, row) => soma + row.total, 0);
}

/* -------------------------------------------------------------------------
   Recorte
   ------------------------------------------------------------------------- */

/**
 * A escola vista pelo Lider: total, genero e secoes so com quem ele
 * cadastrou ali. Nulo quando ele nao cadastrou ninguem nela.
 *
 * O resto do mapa (contagem, ranking, balao, PDFs) le o pino como sempre;
 * por isso o recorte do Lider troca o pino, em vez de cada tela ter de
 * saber do filtro.
 */
export function placeOfLeader(place: PollingPlacePin, leader: string): PollingPlacePin | null {
  const dele = place.leaders?.find((row) => row.id === leader);
  if (!dele || dele.total <= 0) return null;
  return {
    ...place,
    total: dele.total,
    men: dele.men,
    women: dele.women,
    others: dele.others,
    sections: dele.sections,
    leaders: [dele],
  };
}

/**
 * A escola vista por VARIOS Lideres (os de uma referencia): total, genero e
 * secoes somados so com quem eles cadastraram ali. Nulo quando nenhum deles
 * cadastrou ninguem nela.
 */
export function placeOfLeaders(place: PollingPlacePin, lideres: ReadonlySet<string>): PollingPlacePin | null {
  const deles = (place.leaders ?? []).filter((row) => lideres.has(row.id) && row.total > 0);
  if (deles.length === 0) return null;
  if (deles.length === 1) return placeOfLeader(place, deles[0].id);
  const sections: PollingPlacePin['sections'] = [];
  for (const l of deles) {
    for (const row of l.sections) {
      const mesma = sections.find((x) => sectionKey(x) === sectionKey(row));
      if (mesma) mesma.total += row.total;
      else sections.push({ ...row });
    }
  }
  const soma = (campo: 'total' | 'men' | 'women' | 'others') => deles.reduce((t, l) => t + l[campo], 0);
  return {
    ...place,
    total: soma('total'),
    men: soma('men'),
    women: soma('women'),
    others: soma('others'),
    sections,
    leaders: deles,
  };
}

/** O local esta em algum dos municipios escolhidos (nenhum escolhido: todos). */
function emAlgumMunicipio(city: string | null, cities: readonly string[] | undefined): boolean {
  if (!cities?.length) return true;
  const alvo = normalizeSearch(city);
  return cities.some((c) => normalizeSearch(c) === alvo);
}

/**
 * A escola vista por UMA secao: total, genero (na mesma proporcao) e
 * Lideres so com quem vota nela. Nulo quando a secao nao e desta escola.
 *
 * Como o recorte do Lider, troca o pino em vez de cada tela saber do filtro.
 */
export function placeOfSection(place: PollingPlacePin, chave: string): PollingPlacePin | null {
  const secoes = place.sections.filter((row) => sectionKey(row) === chave);
  const total = secoes.reduce((soma, row) => soma + row.total, 0);
  if (secoes.length === 0 || total <= 0) return null;
  const proporcao = place.total > 0 ? total / place.total : 0;
  const leaders = place.leaders
    ?.map((l) => {
      const dele = l.sections.filter((row) => sectionKey(row) === chave);
      const deleTotal = dele.reduce((soma, row) => soma + row.total, 0);
      const parte = l.total > 0 ? deleTotal / l.total : 0;
      return {
        ...l,
        total: deleTotal,
        men: Math.round(l.men * parte),
        women: Math.round(l.women * parte),
        others: Math.max(0, deleTotal - Math.round(l.men * parte) - Math.round(l.women * parte)),
        sections: dele,
      };
    })
    .filter((l) => l.total > 0);
  const men = Math.round(place.men * proporcao);
  const women = Math.round(place.women * proporcao);
  return {
    ...place,
    total,
    men,
    women,
    others: Math.max(0, total - men - women),
    sections: secoes,
    ...(leaders ? { leaders } : {}),
  };
}

function matchesPin(pin: MapPin, query: MapQuery, daReferencia: ReadonlySet<string> | null): boolean {
  if (query.leader && pin.leaderId !== query.leader) return false;
  if (daReferencia && (!pin.leaderId || !daReferencia.has(pin.leaderId))) return false;
  if (query.section && sectionKey({ zone: pin.zone, section: pin.section }) !== query.section) return false;
  if (query.state && normalizeSearch(pin.state) !== normalizeSearch(query.state)) return false;
  if (query.city && normalizeSearch(pin.city) !== normalizeSearch(query.city)) return false;
  if (!emAlgumMunicipio(pin.city, query.cities)) return false;
  if (query.zone && normalizeZone(pin.zone) !== normalizeZone(query.zone)) return false;

  return matchesSearch(
    query.search,
    pin.memberName,
    pin.place,
    pin.district,
    pin.city,
    pin.state,
    pin.clientName,
  );
}

function matchesPlace(place: PollingPlacePin, query: MapQuery): boolean {
  if (query.state && normalizeSearch(place.state) !== normalizeSearch(query.state)) return false;
  if (query.city && normalizeSearch(place.city) !== normalizeSearch(query.city)) return false;
  if (!emAlgumMunicipio(place.city, query.cities)) return false;

  if (query.zone) {
    const alvo = normalizeZone(query.zone);
    const atende = place.sections.some((row) => normalizeZone(row.zone) === alvo);
    if (!atende) return false;
  }

  if (placeVotes(place, query.zone) < query.minVotes) return false;

  return matchesSearch(query.search, place.title, place.address, place.city, place.state);
}

export interface MapSelection {
  pins: MapPin[];
  places: PollingPlacePin[];
  /** Soma da estimativa dos locais visiveis, ja no recorte da zona. */
  votes: number;
  /** Locais visiveis. */
  placeCount: number;
}

/**
 * O mapa inteiro reduzido ao recorte atual.
 *
 * Moradia continua sendo um pino por pessoa e local de votacao um pino por
 * escola — a divisao por tipo e a mesma de sempre, so que agora depois do
 * filtro.
 */
export function applyMapQuery(
  payload: Pick<MapOverviewPayload, 'pins' | 'pollingPlaces' | 'referencias'> | null | undefined,
  query: MapQuery,
): MapSelection {
  // Referencia escolhida: vale a Equipe de qualquer Lider dela.
  const daReferencia = query.references?.length ? lideresDasReferencias(payload, query.references) : null;
  const pins =
    query.kind === 'POLLING_PLACE'
      ? []
      : filterPins(payload?.pins ?? [], 'RESIDENCE').filter((pin) => matchesPin(pin, query, daReferencia));

  const places =
    query.kind === 'RESIDENCE'
      ? []
      : (payload?.pollingPlaces ?? [])
          .map((place) => (daReferencia ? placeOfLeaders(place, daReferencia) : place))
          .map((place) => (place && query.leader ? placeOfLeader(place, query.leader) : place))
          .map((place) => (place && query.section ? placeOfSection(place, query.section) : place))
          .filter((place): place is PollingPlacePin => place !== null && matchesPlace(place, query));

  return {
    pins,
    places,
    votes: places.reduce((soma, place) => soma + placeVotes(place, query.zone), 0),
    placeCount: places.length,
  };
}

/* -------------------------------------------------------------------------
   Opcoes da tela
   ------------------------------------------------------------------------- */

export interface MapOptions {
  states: string[];
  /** Somente as cidades do estado escolhido: opcao morta confunde. */
  cities: string[];
  zones: string[];
  /**
   * As secoes (chave `zona/secao`) com gente ou voto. Com zona escolhida, so
   * as dela; sem zona, todas, com a zona no rotulo.
   */
  sections: { value: string; label: string; zone: string | null }[];
  /** Os Lideres com gente cadastrada que vota em alguma escola do mapa. */
  leaders: LeaderOption[];
  /**
   * As referencias dos Lideres do mapa, de A a Z, e "Sem referência" por
   * ultimo. Vazio no mapa geral (sem referencias no retorno).
   */
  references: ReferenceOption[];
}

export interface ReferenceOption {
  /** Chave da referencia, ou `SEM_REFERENCIA_NO_MAPA`. */
  value: string;
  /** A forma mais escrita dela. */
  label: string;
  /** Lideres dela que aparecem no mapa. */
  leaders: number;
  /** Pessoas que esses Lideres cadastraram nas escolas do mapa. */
  people: number;
}

export interface LeaderOption {
  id: string;
  name: string;
  /** Pessoas que ele cadastrou, somadas em todas as escolas do mapa. */
  people: number;
  /** Escolas onde ele tem alguem. */
  places: number;
  /** A referencia escrita dele, ou nulo sem referencia (ou no mapa geral). */
  reference: string | null;
}

function sortText(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

/**
 * As opcoes saem dos DADOS, nunca de uma lista fixa.
 *
 * Assim o filtro nunca oferece um estado onde a campanha nao tem ninguem, e
 * escolher uma cidade sempre devolve alguma coisa.
 */
export function mapOptions(
  payload: Pick<MapOverviewPayload, 'pins' | 'pollingPlaces' | 'referencias'> | null | undefined,
  state: string | null,
  zone: string | null = null,
): MapOptions {
  const pins = payload?.pins ?? [];
  const places = payload?.pollingPlaces ?? [];

  const noEstado = (value: string | null): boolean =>
    !state || normalizeSearch(value) === normalizeSearch(state);

  const states: string[] = [];
  const cities: string[] = [];
  const zones: string[] = [];
  const secoes = new Map<string, { value: string; label: string; zone: string | null; ordem: [number, number] }>();
  const naZona = (z: string | null) => !zone || normalizeZone(z) === normalizeZone(zone);
  const anotarSecao = (row: { zone: string | null; section: string | null }) => {
    if (!row.section || !naZona(row.zone)) return;
    const value = sectionKey(row);
    if (secoes.has(value)) return;
    const z = row.zone ? normalizeZone(row.zone) : null;
    const sec = row.section.trim().replace(/^0+(?=\d)/, '');
    secoes.set(value, {
      value,
      label: zone || !z ? `Seção ${sec}` : `Zona ${z} · Seção ${sec}`,
      zone: z,
      ordem: [Number(z) || 0, Number(sec) || 0],
    });
  };

  for (const pin of pins) {
    if (pin.state) states.push(pin.state);
    if (pin.city && noEstado(pin.state)) cities.push(pin.city);
    if (pin.zone && noEstado(pin.state)) zones.push(normalizeZone(pin.zone));
    if (noEstado(pin.state)) anotarSecao({ zone: pin.zone, section: pin.section });
  }

  for (const place of places) {
    if (place.state) states.push(place.state);
    if (place.city && noEstado(place.state)) cities.push(place.city);
    if (noEstado(place.state)) {
      for (const row of place.sections) {
        if (row.zone) zones.push(normalizeZone(row.zone));
        anotarSecao(row);
      }
    }
  }

  // Os Lideres saem das escolas (todas, nao so as do estado escolhido): o
  // filtro de Lider responde "onde ele tem gente", e a resposta pode estar
  // em outro estado.
  const lideres = new Map<string, LeaderOption>();
  for (const place of places) {
    for (const row of place.leaders ?? []) {
      const atual = lideres.get(row.id) ?? {
        id: row.id,
        name: row.name,
        people: 0,
        places: 0,
        reference: referenciaDoLider(payload?.referencias, row),
      };
      atual.people += row.total;
      atual.places += 1;
      lideres.set(row.id, atual);
    }
  }
  const leaders = [...lideres.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  // As referencias saem dos Lideres do mapa: cada uma com quantos Lideres e
  // quantas pessoas, e o rotulo na forma mais escrita.
  const porReferencia = new Map<string, { formas: Map<string, number>; leaders: number; people: number }>();
  if (payload?.referencias) {
    for (const l of leaders) {
      const chave = chaveDaReferenciaNoMapa(l.reference) || SEM_REFERENCIA_NO_MAPA;
      const grupo = porReferencia.get(chave) ?? { formas: new Map(), leaders: 0, people: 0 };
      if (l.reference) {
        const forma = l.reference.replace(/\s+/g, ' ').trim();
        grupo.formas.set(forma, (grupo.formas.get(forma) ?? 0) + 1);
      }
      grupo.leaders += 1;
      grupo.people += l.people;
      porReferencia.set(chave, grupo);
    }
  }
  const references = [...porReferencia.entries()]
    .map(([value, g]) => ({
      value,
      label: value === SEM_REFERENCIA_NO_MAPA ? 'Sem referência' : [...g.formas.entries()].sort((a, b) => b[1] - a[1])[0][0],
      leaders: g.leaders,
      people: g.people,
    }))
    .sort(
      (a, b) =>
        Number(a.value === SEM_REFERENCIA_NO_MAPA) - Number(b.value === SEM_REFERENCIA_NO_MAPA) ||
        a.label.localeCompare(b.label, 'pt-BR'),
    );

  const sections = [...secoes.values()]
    .sort((a, b) => a.ordem[0] - b.ordem[0] || a.ordem[1] - b.ordem[1])
    .map(({ value, label, zone: z }) => ({ value, label, zone: z }));

  return { states: sortText(states), cities: sortText(cities), zones: sortText(zones), sections, leaders, references };
}

/* -------------------------------------------------------------------------
   Ranking: onde a campanha tem mais voto
   ------------------------------------------------------------------------- */

export interface RankedPlace {
  place: PollingPlacePin;
  votes: number;
  /** Tamanho relativo ao primeiro colocado, de 0 a 1. So para a barra. */
  share: number;
  /** Posicao na lista, comecando em 1. */
  position: number;
}

/**
 * Os locais do recorte, do maior para o menor.
 *
 * Empate desempata pelo nome, para a lista nao trocar de ordem a cada
 * releitura — uma lista que se mexe sozinha nao serve para decidir nada.
 */
export function rankPlaces(places: readonly PollingPlacePin[], zone: string | null): RankedPlace[] {
  const comVotos = places
    .map((place) => ({ place, votes: placeVotes(place, zone) }))
    .sort((a, b) => {
      if (b.votes !== a.votes) return b.votes - a.votes;
      return (a.place.title ?? '').localeCompare(b.place.title ?? '', 'pt-BR');
    });

  const lider = comVotos[0]?.votes ?? 0;

  return comVotos.map((item, index) => ({
    ...item,
    share: lider > 0 ? item.votes / lider : 0,
    position: index + 1,
  }));
}

/**
 * As secoes do local, ja recortadas pela zona escolhida.
 *
 * Com a zona filtrada, mostrar as secoes das outras zonas da escola faria a
 * soma da lista nao bater com o numero exibido ao lado dela.
 */
export function sectionsInZone(place: PollingPlacePin, zone: string | null): string[] {
  const alvo = zone ? normalizeZone(zone) : null;
  return place.sections
    .filter((row) => !alvo || normalizeZone(row.zone) === alvo)
    .map((row) => sectionLabel(row));
}

/* -------------------------------------------------------------------------
   Estado do filtro
   ------------------------------------------------------------------------- */

/** Quantos recortes estao ligados. O tipo de pino nao conta: ele e a visao. */
export function activeFilterCount(query: MapQuery): number {
  let total = 0;
  if (query.search.trim()) total += 1;
  if (query.state) total += 1;
  if (query.city) total += 1;
  if (query.cities?.length) total += 1;
  if (query.zone) total += 1;
  if (query.section) total += 1;
  if (query.minVotes > 0) total += 1;
  if (query.leader) total += 1;
  if (query.references?.length) total += 1;
  return total;
}

/**
 * Limpa os recortes e MANTEM a visao escolhida.
 *
 * Quem estava vendo so os locais de votacao nao pediu para voltar a ver
 * pessoas: limpar filtro nao pode desfazer a escolha que nao e filtro.
 */
export function clearFilters(query: MapQuery): MapQuery {
  return { ...DEFAULT_MAP_QUERY, kind: query.kind };
}
