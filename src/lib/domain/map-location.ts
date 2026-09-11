/**
 * Coordenadas do mapa: montagem da consulta e leitura da resposta.
 *
 * Modulo puro, sem rede e sem banco. Ele decide exatamente o que e perguntado
 * ao provedor (apenas endereco, nunca dado da pessoa) e o que pode ser aceito
 * como coordenada confiavel.
 */

export const LOCATION_KINDS = ['RESIDENCE', 'POLLING_PLACE'] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export const LOCATION_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SUCCESS',
  'NOT_FOUND',
  'FAILED',
] as const;
export type LocationStatus = (typeof LOCATION_STATUSES)[number];

/** Codigos de erro seguros. Nunca carregam a consulta nem a resposta bruta. */
export const MAP_ERROR_CODES = [
  'BAD_REQUEST',
  'INVALID_KEY',
  'NO_ACCESS',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'TIMEOUT',
  'UNEXPECTED',
  'MISSING_CONFIG',
  'MISSING_DATA',
] as const;
export type MapErrorCode = (typeof MAP_ERROR_CODES)[number];

export const MAP_ERROR_LABELS: Record<MapErrorCode, string> = {
  BAD_REQUEST: 'Consulta recusada pelo provedor.',
  INVALID_KEY: 'Chave de acesso inválida.',
  NO_ACCESS: 'Acesso ou crédito indisponível.',
  RATE_LIMITED: 'Limite de consultas atingido.',
  PROVIDER_UNAVAILABLE: 'Falha temporária do provedor.',
  TIMEOUT: 'O provedor não respondeu a tempo.',
  UNEXPECTED: 'Resposta inesperada do provedor.',
  MISSING_CONFIG: 'Serviço de mapa não configurado.',
  MISSING_DATA: 'Endereço incompleto para localizar.',
};

/* -------------------------------------------------------------------------
   Consulta
   ------------------------------------------------------------------------- */

export interface AddressParts {
  /** Nome do local (escola, ginásio). Só existe no local de votação. */
  place?: string | null;
  street?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  /** Aceita consultar somente pelo municipio, sem rua nem bairro. */
  allowCityOnly?: boolean;
}

function clean(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Texto da consulta: somente endereco.
 *
 * Nada da pessoa entra aqui — nem nome, CPF, telefone, nascimento, nome da
 * mae, titulo, zona, secao ou numero da casa. Sem municipio ou UF a consulta
 * nao existe: uma rua sem cidade acharia outro lugar.
 */
export function buildQuery(parts: AddressParts): string | null {
  const city = clean(parts.city);
  const state = clean(parts.state).toUpperCase();
  if (!city || state.length !== 2) return null;

  const head = [clean(parts.place), clean(parts.street), clean(parts.district)].filter(Boolean);
  if (head.length === 0) return parts.allowCityOnly ? `${city} - ${state}, Brasil` : null;

  return `${head.join(', ')}, ${city} - ${state}, Brasil`;
}

export const LOCATION_PRECISIONS = ['STREET', 'DISTRICT', 'CITY'] as const;
export type LocationPrecision = (typeof LOCATION_PRECISIONS)[number];

/** Texto do popup conforme ate onde o endereco chegou. */
export const PRECISION_LABELS: Record<LocationPrecision, string> = {
  STREET: 'Localização aproximada da rua',
  DISTRICT: 'Localização aproximada do bairro',
  CITY: 'Localização aproximada do município',
};

export interface ResidenceLookup {
  query: string;
  precision: LocationPrecision;
}

/**
 * Consulta da moradia, com o endereco mais completo que existir.
 *
 * Uma consulta so: com rua, senao com bairro, senao apenas o municipio. Sem
 * municipio e UF nao ha consulta — e a precisao diz do que o ponto trata,
 * para a tela nunca sugerir a casa exata.
 */
export function residenceLookup(parts: {
  street?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
}): ResidenceLookup | null {
  const street = clean(parts.street);
  const district = clean(parts.district);

  const precision: LocationPrecision = street ? 'STREET' : district ? 'DISTRICT' : 'CITY';
  const query = buildQuery({
    street: street || null,
    district: street || district ? district : null,
    city: parts.city,
    state: parts.state,
    allowCityOnly: precision === 'CITY',
  });

  return query ? { query, precision } : null;
}

/** Consulta do local de votacao, a partir do domicilio eleitoral. */
export function pollingPlaceQuery(parts: {
  local?: string | null;
  logradouro?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
}): string | null {
  if (!clean(parts.local)) return null;
  return buildQuery({
    place: parts.local,
    street: parts.logradouro,
    district: parts.bairro,
    city: parts.municipio,
    state: parts.uf,
  });
}

/** Forma estavel da consulta, usada para o hash do cache. */
export function normalizeQuery(query: string): string {
  return query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/* -------------------------------------------------------------------------
   Leitura da resposta
   ------------------------------------------------------------------------- */

export interface MapPlace {
  latitude: number;
  longitude: number;
  title: string | null;
  address: string | null;
  placeId: string | null;
  dataId: string | null;
  /** Miniatura do local, sempre HTTPS. Uma imagem so, ou nada. */
  imageUrl: string | null;
}

interface RawPlace {
  serpapi_thumbnail?: unknown;
  thumbnail?: unknown;
  title?: unknown;
  place_id?: unknown;
  data_id?: unknown;
  address?: unknown;
  country?: unknown;
  gps_coordinates?: { latitude?: unknown; longitude?: unknown } | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, max = 300): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function comparable(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Aceita apenas o que é reconhecidamente Brasil. */
function brazilian(country: unknown): boolean {
  const value = comparable(text(country, 60));
  if (!value) return true; // Campo ausente nao reprova por si so.
  return ['brasil', 'brazil', 'br'].includes(value);
}

/** Quando da para conferir, o endereco devolvido precisa bater com a cidade. */
function matchesPlace(address: string | null, expected: AddressParts): boolean {
  const haystack = comparable(address);
  if (!haystack) return true;

  const city = comparable(clean(expected.city));
  const state = comparable(clean(expected.state));

  if (city && !haystack.includes(city)) return false;
  if (state && !haystack.includes(state) && !haystack.includes(` - ${state}`)) {
    // A UF pode nao aparecer no texto: nesse caso a cidade ja decidiu.
    return haystack.length > 0 && Boolean(city);
  }
  return true;
}

/** Numero de verdade: nulo, vazio ou texto invalido nao viram coordenada. */
function coordinate(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Somente URL HTTPS valida. Qualquer outra coisa e descartada. */
function imageUrl(value: unknown): string | null {
  const raw = text(value, 1000);
  if (!raw || !raw.startsWith('https://')) return null;

  try {
    return new URL(raw).protocol === 'https:' ? raw : null;
  } catch {
    return null;
  }
}

function toPlace(raw: RawPlace | null, expected: AddressParts): MapPlace | null {
  if (!raw) return null;
  if (!brazilian(raw.country)) return null;

  const coords = record(raw.gps_coordinates);
  const latitude = coordinate(coords?.latitude);
  const longitude = coordinate(coords?.longitude);

  // Ausente ou nulo nao vira zero: (0, 0) e um ponto no meio do oceano.
  if (latitude === null || longitude === null) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;

  const address = text(raw.address, 500);
  if (!matchesPlace(address, expected)) return null;

  return {
    latitude,
    longitude,
    title: text(raw.title),
    address,
    placeId: text(raw.place_id, 200),
    dataId: text(raw.data_id, 200),
    // `serpapi_thumbnail` tem prioridade; sem ele, `thumbnail`; sem nenhum, nada.
    imageUrl: imageUrl(raw.serpapi_thumbnail) ?? imageUrl(raw.thumbnail),
  };
}

/**
 * Le a resposta do provedor.
 *
 * Primeiro `place_results`; sem coordenada confiavel ali, o primeiro item
 * valido de `local_results`. Nada mais da resposta e olhado: sugestoes,
 * miniaturas e resultados relacionados sao ignorados. Sem resultado confiavel
 * o retorno e `null`, que vira NOT_FOUND — coordenada nunca e inventada.
 */
export function parsePlace(payload: unknown, expected: AddressParts): MapPlace | null {
  const root = record(payload);
  if (!root) return null;

  const single = toPlace(record(root.place_results) as RawPlace | null, expected);
  if (single) return single;

  const list = Array.isArray(root.local_results) ? root.local_results : [];
  for (const item of list) {
    const place = toPlace(record(item) as RawPlace | null, expected);
    if (place) return place;
  }

  return null;
}

/** Mensagem de erro declarada pelo proprio provedor, quando houver. */
export function providerError(payload: unknown): boolean {
  const root = record(payload);
  if (!root) return false;

  if (typeof root.error === 'string' && root.error.trim()) return true;

  const metadata = record(root.search_metadata);
  const status = text(metadata?.status, 40)?.toLowerCase();
  return Boolean(status && status !== 'success');
}
