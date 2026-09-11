import { z } from 'zod';
import { UF_OPTIONS, normalizePlace, normalizeState } from '@/lib/utils/documents';
import { normalizeSearch } from '@/lib/utils/text';

/**
 * Localidades brasileiras (estados, municipios e bairros).
 *
 * Este modulo e puro: monta as URLs, confere o formato das respostas e
 * descreve o encadeamento Estado -> Municipio -> Bairro. As chamadas externas
 * acontecem apenas no servidor, pelas rotas em `/api/localidades`.
 */

const BASE_URL = 'https://api.brasilaberto.com/v1';

/** Tempo maximo de espera da API externa. */
export const LOCATION_TIMEOUT_MS = 8_000;

/**
 * Cache das listas: sete dias para estados e municipios, 24 horas para
 * bairros e ruas.
 */
export const CACHE_SECONDS = {
  states: 60 * 60 * 24 * 7,
  cities: 60 * 60 * 24 * 7,
  districts: 60 * 60 * 24,
  streets: 60 * 60 * 24,
} as const;

export interface StateOption {
  /** Sigla da UF: e o valor gravado no banco. */
  uf: string;
  name: string;
}

export interface CityOption {
  /** Identificador da Brasil Aberto: e ele que busca os bairros. */
  id: number;
  /** Codigo IBGE do municipio. Preservado, mas nao usado nos bairros. */
  ibgeId: number | null;
  name: string;
}

export interface DistrictOption {
  /** Identificador do bairro: usado apenas para buscar as ruas. */
  id: number;
  name: string;
}

export interface StreetOption {
  name: string;
}

/** Falha prevista ao consultar a API externa. Nunca carrega detalhe interno. */
export class LocationError extends Error {
  constructor(message = 'Não foi possível carregar as localidades.') {
    super(message);
    this.name = 'LocationError';
  }
}

/* -------------------------------------------------------------------------
   Formato das respostas
   ------------------------------------------------------------------------- */

/**
 * Extrai a lista de uma resposta da API.
 *
 * A lista pode vir direta ou dentro de `result`/`data`. Devolve `null` quando
 * nao ha lista nenhuma: so isso e tratado como resposta fora do formato.
 */
function rawList(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;

  const record = payload as Record<string, unknown>;
  for (const key of ['result', 'data', 'items']) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = rawList(value);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Le linha a linha, ignorando o que nao encaixa.
 * Um registro estranho no meio da lista nao derruba a lista inteira.
 */
function rows<T>(payload: unknown, schema: z.ZodType<T>): T[] {
  const list = rawList(payload);
  if (!list) throw new LocationError();

  const parsed: T[] = [];
  for (const item of list) {
    const result = schema.safeParse(item);
    if (result.success) parsed.push(result.data);
  }
  return parsed;
}

/** A API devolve `shortName`; os demais nomes cobrem variacoes da resposta. */
const stateSchema = z.object({
  name: z.string().min(1),
  shortName: z.string().length(2).optional(),
  acronym: z.string().length(2).optional(),
  initials: z.string().length(2).optional(),
  uf: z.string().length(2).optional(),
});

/** A resposta traz `id` e `ibgeId`; os dois sao preservados. */
const citySchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  ibgeId: z.union([z.number(), z.string()]).optional(),
  name: z.string().min(1),
});

/** O bairro traz `id` e `name`; o identificador so serve para as ruas. */
const districtSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  name: z.string().min(1),
});

/** Da rua interessa apenas o nome: e ele que sera gravado. */
const streetSchema = z.union([
  z.string().min(1),
  z.object({ id: z.union([z.number(), z.string()]).optional(), name: z.string().min(1) }),
]);

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR');

export function parseStates(payload: unknown): StateOption[] {
  const states: StateOption[] = [];

  for (const row of rows(payload, stateSchema)) {
    const uf = normalizeState(row.shortName ?? row.acronym ?? row.initials ?? row.uf ?? '');
    if (!uf) continue;
    states.push({ uf, name: row.name.trim() });
  }

  if (states.length === 0) throw new LocationError();
  return states.sort(byName);
}

export function parseCities(payload: unknown): CityOption[] {
  const cities: CityOption[] = [];

  for (const row of rows(payload, citySchema)) {
    const id = toCityId(row.id ?? null);
    if (id === null) continue;
    cities.push({
      id,
      ibgeId: toCityId(row.ibgeId ?? null),
      name: normalizePlace(row.name) || row.name.trim(),
    });
  }

  if (cities.length === 0) throw new LocationError();
  return cities.sort(byName);
}

export function parseDistricts(payload: unknown): DistrictOption[] {
  const seen = new Set<string>();
  const districts: DistrictOption[] = [];

  for (const row of rows(payload, districtSchema)) {
    const id = toCityId(row.id ?? null);
    const name = normalizePlace(row.name) || row.name.trim();
    const key = normalizeSearch(name);
    if (id === null || !name || seen.has(key)) continue;
    seen.add(key);
    districts.push({ id, name });
  }

  return districts.sort(byName);
}

export function parseStreets(payload: unknown): StreetOption[] {
  const seen = new Set<string>();
  const streets: StreetOption[] = [];

  for (const row of rows(payload, streetSchema)) {
    const raw = typeof row === 'string' ? row : row.name;
    const name = normalizePlace(raw) || raw.trim();
    const key = normalizeSearch(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    streets.push({ name });
  }

  return streets.sort(byName);
}

/* -------------------------------------------------------------------------
   Entradas aceitas e montagem das URLs
   ------------------------------------------------------------------------- */

/** Aceita apenas inteiro positivo. O identificador vem sempre da propria API. */
export function isCityId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function toCityId(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return isCityId(parsed) ? parsed : null;
}

/**
 * As URLs sao montadas aqui, sempre a partir da base fixa. Nenhum endereco
 * informado por quem usa o sistema chega a API externa.
 */
export function statesUrl(): string {
  return `${BASE_URL}/states`;
}

export function citiesUrl(uf: string): string {
  const code = normalizeState(uf);
  if (!code) throw new LocationError('Estado inválido.');
  return `${BASE_URL}/cities/${encodeURIComponent(code)}`;
}

/** Bairros pelo identificador interno do municipio (`city.id`). */
export function districtsUrl(cityId: number): string {
  if (!isCityId(cityId)) throw new LocationError('Município inválido.');
  return `${BASE_URL}/districts/${cityId}`;
}

/** Ruas pelo identificador do bairro (`district.id`), nunca pelo nome. */
export function streetsUrl(districtId: number): string {
  if (!isCityId(districtId)) throw new LocationError('Bairro inválido.');
  return `${BASE_URL}/streets/${districtId}`;
}

export const UF_CODES: readonly string[] = UF_OPTIONS.map((option) => option.id);

/* -------------------------------------------------------------------------
   Caminhos internos usados pelo navegador
   ------------------------------------------------------------------------- */

/**
 * Versao do formato devolvido pelas rotas internas.
 *
 * As respostas ficam guardadas por dias no navegador e na borda. Mudar este
 * numero descarta o que foi guardado com o formato anterior: sem isso, uma
 * lista antiga de municipios (que trazia o codigo do IBGE no lugar do `id`)
 * continuaria pedindo bairros com o identificador errado.
 */
export const LOCATION_FORMAT = 2;

export function statesPath(): string {
  return `/api/localidades/estados?v=${LOCATION_FORMAT}`;
}

export function citiesPath(uf: string): string {
  return `/api/localidades/municipios/${encodeURIComponent(uf)}?v=${LOCATION_FORMAT}`;
}

/** Ruas: o identificador do bairro vem da lista carregada, so em memoria. */
export function streetsPath(district: Pick<DistrictOption, 'id'>): string {
  return `/api/localidades/ruas/${district.id}?v=${LOCATION_FORMAT}`;
}

/**
 * Bairros: o navegador manda apenas a UF e o nome do municipio.
 *
 * O identificador da Brasil Aberto e resolvido no servidor, a partir da lista
 * de municipios daquela UF. Assim nenhuma lista guardada no navegador pode
 * levar um identificador errado ate a API.
 */
export function districtsPath(uf: string, cityName: string): string {
  const params = new URLSearchParams({ uf, municipio: cityName, v: String(LOCATION_FORMAT) });
  return `/api/localidades/bairros?${params.toString()}`;
}

/* -------------------------------------------------------------------------
   Encadeamento Estado -> Municipio -> Bairro -> Rua
   ------------------------------------------------------------------------- */

/**
 * Marca da opcao "Outro" nas listas.
 *
 * Vive apenas na tela: o que chega ao banco e sempre o nome digitado. Um
 * valor com este texto nunca e aceito como nome.
 */
export const OTHER_OPTION = '__OTHER__';

/** Passos que aceitam digitacao livre quando a lista nao serve. */
export type ChainKey = 'city' | 'district' | 'street';

export const CHAIN_ORDER: readonly ChainKey[] = ['city', 'district', 'street'];

export interface ChainValues {
  state: string;
  city: string;
  district: string;
  street: string;
}

/**
 * Limpa o passo informado e todos os seguintes.
 * Trocar o estado zera municipio, bairro e rua; trocar o municipio zera bairro
 * e rua; trocar o bairro zera a rua.
 */
export function clearFrom(values: ChainValues, key: ChainKey): ChainValues {
  const next = { ...values };
  for (const step of CHAIN_ORDER.slice(CHAIN_ORDER.indexOf(key))) next[step] = '';
  return next;
}

/**
 * Digitacao forcada em cascata.
 *
 * Sem `cityId` nao ha lista de bairros, e sem `districtId` nao ha lista de
 * ruas: escolher "Outro" em um passo obriga os seguintes a serem digitados.
 */
export function forcedManual(
  manual: Record<ChainKey, boolean>,
): Record<ChainKey, boolean> {
  const city = manual.city;
  const district = city || manual.district;
  return { city, district, street: district || manual.street };
}

/** Nome digitado a mao, ja normalizado. Vazio ou o marcador viram nulo. */
export function manualPlace(value: string | null | undefined, maxLength = 120): string | null {
  const trimmed = normalizePlace(value ?? '', maxLength);
  if (!trimmed || trimmed === OTHER_OPTION) return null;
  return trimmed.length < 2 ? null : trimmed;
}

export interface LocationSelection {
  /** Sigla da UF. */
  state: string;
  /** Nome do municipio, como sera gravado. */
  city: string;
  /** Identificador da Brasil Aberto: vive apenas durante o preenchimento. */
  cityId: number | null;
  /** Nome do bairro, como sera gravado. */
  district: string;
}

export const EMPTY_SELECTION: LocationSelection = {
  state: '',
  city: '',
  cityId: null,
  district: '',
};

/** Trocar o estado limpa municipio e bairro. */
export function selectState(current: LocationSelection, uf: string): LocationSelection {
  const state = normalizeState(uf) ?? '';
  if (state === current.state) return current;
  return { state, city: '', cityId: null, district: '' };
}

/** Trocar o municipio limpa o bairro. */
export function selectCity(current: LocationSelection, city: CityOption | null): LocationSelection {
  return {
    ...current,
    city: city?.name ?? '',
    cityId: city?.id ?? null,
    district: '',
  };
}

export function selectDistrict(current: LocationSelection, district: string): LocationSelection {
  return { ...current, district };
}

/** Localiza o municipio ja gravado dentro da lista carregada. */
export function findCity(cities: CityOption[], name: string): CityOption | null {
  const needle = normalizeSearch(name);
  if (!needle) return null;
  return cities.find((city) => normalizeSearch(city.name) === needle) ?? null;
}

/**
 * Mantem visivel um valor antigo que a API nao conhece mais.
 * Nada e apagado sozinho: a troca continua sendo do ADMIN.
 */
export function withCurrentValue(
  options: { value: string; label: string }[],
  current: string,
): { value: string; label: string }[] {
  const value = current.trim();
  if (!value) return options;

  const needle = normalizeSearch(value);
  if (options.some((option) => normalizeSearch(option.value) === needle)) return options;

  return [{ value, label: `${value} (valor atual)` }, ...options];
}
