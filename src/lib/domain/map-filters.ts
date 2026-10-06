import { matchesSearch, normalizeSearch } from '@/lib/utils/text';
import {
  filterPins,
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
  /** Esconde local de votacao abaixo deste tamanho. */
  minVotes: number;
  /**
   * So as pessoas que este Lider cadastrou (chave de `leaderKey`). A escola
   * passa a contar so a Equipe dele, secao por secao, e some do mapa onde
   * ele nao cadastrou ninguem.
   */
  leader: string | null;
}

export const DEFAULT_MAP_QUERY: MapQuery = {
  kind: 'BOTH',
  search: '',
  state: null,
  city: null,
  cities: [],
  zone: null,
  minVotes: 0,
  leader: null,
};

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

/** O local esta em algum dos municipios escolhidos (nenhum escolhido: todos). */
function emAlgumMunicipio(city: string | null, cities: readonly string[] | undefined): boolean {
  if (!cities?.length) return true;
  const alvo = normalizeSearch(city);
  return cities.some((c) => normalizeSearch(c) === alvo);
}

function matchesPin(pin: MapPin, query: MapQuery): boolean {
  if (query.leader && pin.leaderId !== query.leader) return false;
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
  payload: Pick<MapOverviewPayload, 'pins' | 'pollingPlaces'> | null | undefined,
  query: MapQuery,
): MapSelection {
  const pins =
    query.kind === 'POLLING_PLACE'
      ? []
      : filterPins(payload?.pins ?? [], 'RESIDENCE').filter((pin) => matchesPin(pin, query));

  const places =
    query.kind === 'RESIDENCE'
      ? []
      : (payload?.pollingPlaces ?? [])
          .map((place) => (query.leader ? placeOfLeader(place, query.leader) : place))
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
  /** Os Lideres com gente cadastrada que vota em alguma escola do mapa. */
  leaders: LeaderOption[];
}

export interface LeaderOption {
  id: string;
  name: string;
  /** Pessoas que ele cadastrou, somadas em todas as escolas do mapa. */
  people: number;
  /** Escolas onde ele tem alguem. */
  places: number;
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
  payload: Pick<MapOverviewPayload, 'pins' | 'pollingPlaces'> | null | undefined,
  state: string | null,
): MapOptions {
  const pins = payload?.pins ?? [];
  const places = payload?.pollingPlaces ?? [];

  const noEstado = (value: string | null): boolean =>
    !state || normalizeSearch(value) === normalizeSearch(state);

  const states: string[] = [];
  const cities: string[] = [];
  const zones: string[] = [];

  for (const pin of pins) {
    if (pin.state) states.push(pin.state);
    if (pin.city && noEstado(pin.state)) cities.push(pin.city);
    if (pin.zone && noEstado(pin.state)) zones.push(normalizeZone(pin.zone));
  }

  for (const place of places) {
    if (place.state) states.push(place.state);
    if (place.city && noEstado(place.state)) cities.push(place.city);
    if (noEstado(place.state)) {
      for (const row of place.sections) {
        if (row.zone) zones.push(normalizeZone(row.zone));
      }
    }
  }

  // Os Lideres saem das escolas (todas, nao so as do estado escolhido): o
  // filtro de Lider responde "onde ele tem gente", e a resposta pode estar
  // em outro estado.
  const lideres = new Map<string, LeaderOption>();
  for (const place of places) {
    for (const row of place.leaders ?? []) {
      const atual = lideres.get(row.id) ?? { id: row.id, name: row.name, people: 0, places: 0 };
      atual.people += row.total;
      atual.places += 1;
      lideres.set(row.id, atual);
    }
  }
  const leaders = [...lideres.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return { states: sortText(states), cities: sortText(cities), zones: sortText(zones), leaders };
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
  if (query.minVotes > 0) total += 1;
  if (query.leader) total += 1;
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
