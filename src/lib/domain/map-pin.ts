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
}

export interface MapTotals {
  residence: number;
  pollingPlace: number;
  pending: number;
  notFound: number;
}

export interface MapOverviewPayload {
  pins: MapPin[];
  totals: MapTotals;
}

/** Filtro do cabecalho. A tela comeca em "Moradia". */
export const MAP_FILTERS = ['RESIDENCE', 'POLLING_PLACE', 'BOTH'] as const;
export type MapFilter = (typeof MAP_FILTERS)[number];

/** A tela abre mostrando os dois tipos: nada fica escondido por padrao. */
export const DEFAULT_MAP_FILTER: MapFilter = 'BOTH';

export const MAP_FILTER_LABELS: Record<MapFilter, string> = {
  RESIDENCE: 'Moradia',
  POLLING_PLACE: 'Local de votação',
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
