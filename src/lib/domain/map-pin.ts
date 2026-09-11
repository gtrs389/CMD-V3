import { PRECISION_LABELS, type LocationKind, type LocationPrecision } from './map-location';

/**
 * Pinos do mapa e agrupamento por proximidade.
 *
 * Modulo puro: a mesma regra vale no servidor, no navegador e nos testes.
 * Cada integrante continua contado individualmente dentro do grupo.
 */

export interface MapPin {
  memberId: string;
  memberName: string;
  memberPhoto: string | null;
  clientId: string;
  clientName: string;
  locationKind: LocationKind;
  latitude: number;
  longitude: number;
  /** Rua, na moradia; nome do local, no local de votacao. */
  place: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zone: string | null;
  section: string | null;
  /** Ate onde o endereco chegou: rua, bairro ou municipio. */
  precision: LocationPrecision;
  /** Somente quando cadastrados. Ausentes nao viram linha vazia na tela. */
  phone: string | null;
  email: string | null;
}

/**
 * Local de votacao agrupado.
 *
 * O pino representa a escola, nao uma pessoa: nenhum nome, telefone ou e-mail
 * aparece aqui. As contagens vem dos integrantes cadastrados no CMD.
 */
export interface PollingPlacePin {
  locationId: string;
  latitude: number;
  longitude: number;
  title: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  imageUrl: string | null;
  /** Cadastros com titulo confirmado que votam ali. Base da estimativa. */
  total: number;
  men: number;
  women: number;
  /** Outro, prefiro nao informar ou sem genero declarado. Fecha o total. */
  others: number;
}

/**
 * Estimativa de votos da escola.
 *
 * Uma pessoa cadastrada que vota ali, um voto: o numero e a contagem de
 * cadastros cujo titulo de eleitor aponta para aquele local. Nada e projetado,
 * ponderado ou inferido — e "estimativa" porque cadastro nao e voto garantido,
 * nao porque exista modelo por tras.
 *
 * A regra mora aqui: o popup do mapa e o painel lateral mostram o mesmo
 * numero, com o mesmo nome, sempre.
 */
export const ESTIMATED_VOTES_LABEL = 'Estimativa de votos';

/** Explica de que o numero e feito, para ninguem ler como projecao. */
export const ESTIMATED_VOTES_HINT = 'Uma pessoa cadastrada que vota aqui, um voto';

export function estimatedVotes(place: Pick<PollingPlacePin, 'total'>): number {
  return place.total;
}

/** Composicao da estimativa por genero declarado. Sempre fecha o total. */
export function voteBreakdown(
  place: Pick<PollingPlacePin, 'men' | 'women' | 'others'>,
): { label: string; value: number }[] {
  return [
    { label: 'Homens', value: place.men },
    { label: 'Mulheres', value: place.women },
    { label: 'Não informado', value: place.others },
  ];
}

/** Chave de agrupamento: place_id, senao data_id, senao coordenada + titulo. */
export function pollingPlaceKey(place: {
  placeId?: string | null;
  dataId?: string | null;
  latitude: number;
  longitude: number;
  title?: string | null;
}): string {
  if (place.placeId?.trim()) return `place:${place.placeId.trim()}`;
  if (place.dataId?.trim()) return `data:${place.dataId.trim()}`;

  const title = (place.title ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  return `geo:${place.latitude.toFixed(5)},${place.longitude.toFixed(5)}:${title}`;
}

/** Genero declarado no cadastro. O que a consulta externa devolveu nao entra. */
export function genderBucket(gender: string | null | undefined): 'men' | 'women' | 'others' {
  if (gender === 'HOMEM') return 'men';
  if (gender === 'MULHER') return 'women';
  return 'others';
}

export interface MapTotals {
  residence: number;
  pollingPlace: number;
  pending: number;
  notFound: number;
}

export interface MapOverviewPayload {
  /** Somente moradia: o local de votacao vem agrupado em `pollingPlaces`. */
  pins: MapPin[];
  pollingPlaces: PollingPlacePin[];
  totals: MapTotals;
}

/** Pessoa listada apenas depois do clique em "Ver pessoas". */
export interface PlaceMember {
  memberId: string;
  name: string;
  photo: string | null;
  clientId: string;
  clientName: string;
  /** Ausentes nao viram linha vazia: a tela simplesmente nao mostra. */
  phone: string | null;
  email: string | null;
  zone: string | null;
  section: string | null;
}

export interface PlaceMembersPayload {
  items: PlaceMember[];
  total: number;
  page: number;
  pageSize: number;
}

/** Filtro do cabecalho. A tela comeca em "Moradia". */
export const MAP_FILTERS = ['RESIDENCE', 'POLLING_PLACE', 'BOTH'] as const;
export type MapFilter = (typeof MAP_FILTERS)[number];

/** A tela abre mostrando os dois tipos: nada fica escondido por padrao. */
export const DEFAULT_MAP_FILTER: MapFilter = 'BOTH';

export const MAP_FILTER_LABELS: Record<MapFilter, string> = {
  RESIDENCE: 'Pessoas',
  POLLING_PLACE: 'Locais de votação',
  BOTH: 'Ambos',
};

export function filterPins(pins: MapPin[], filter: MapFilter): MapPin[] {
  if (filter === 'BOTH') return pins;
  return pins.filter((pin) => pin.locationKind === filter);
}

/** Aviso de precisao do ponto, para nunca sugerir a casa exata. */
export function precisionLabel(pin: MapPin): string {
  return PRECISION_LABELS[pin.precision] ?? PRECISION_LABELS.CITY;
}

/** Texto principal do popup, conforme o tipo do pino. */
export function pinLabel(pin: MapPin): string {
  return pin.place || (pin.locationKind === 'RESIDENCE' ? 'Rua não informada' : 'Local de votação');
}

export interface PinCluster {
  id: string;
  latitude: number;
  longitude: number;
  pins: MapPin[];
}

/**
 * Agrupa pontos proximos de acordo com o zoom.
 *
 * Quanto mais perto, menor a celula: em zoom alto cada pessoa aparece
 * sozinha; em zoom baixo, quem esta na mesma rua ou na mesma escola vira um
 * unico marcador com a contagem.
 */
export function clusterPins(pins: MapPin[], zoom: number): PinCluster[] {
  const size = cellSize(zoom);
  const groups = new Map<string, MapPin[]>();

  for (const pin of pins) {
    const key = `${Math.round(pin.latitude / size)}:${Math.round(pin.longitude / size)}:${pin.locationKind}`;
    const list = groups.get(key) ?? [];
    list.push(pin);
    groups.set(key, list);
  }

  return [...groups.entries()].map(([id, list]) => ({
    id,
    latitude: list.reduce((sum, pin) => sum + pin.latitude, 0) / list.length,
    longitude: list.reduce((sum, pin) => sum + pin.longitude, 0) / list.length,
    pins: list,
  }));
}

/** Lado da celula em graus. Cai pela metade a cada nivel de zoom. */
export function cellSize(zoom: number): number {
  const level = Math.min(Math.max(zoom, 1), 18);
  return 8 / 2 ** (level - 1);
}
