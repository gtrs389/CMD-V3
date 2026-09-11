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

/** Cache das listas: sete dias para estados e municipios, 24 horas para bairros. */
export const CACHE_SECONDS = {
  states: 60 * 60 * 24 * 7,
  cities: 60 * 60 * 24 * 7,
  districts: 60 * 60 * 24,
} as const;

export interface StateOption {
  /** Sigla da UF: e o valor gravado no banco. */
  uf: string;
  name: string;
}

export interface CityOption {
  /** Identificador usado apenas para buscar os bairros. Nunca e gravado. */
  id: number;
  name: string;
}

export interface DistrictOption {
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

const listOf = <T extends z.ZodTypeAny>(item: T) =>
  z.union([z.array(item), z.object({ result: z.array(item) })]);

const stateSchema = z.object({
  name: z.string().min(1),
  acronym: z.string().length(2).optional(),
  initials: z.string().length(2).optional(),
  uf: z.string().length(2).optional(),
});

const citySchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string().min(1),
});

const districtSchema = z.object({ name: z.string().min(1) });

function items<T>(payload: unknown, schema: z.ZodType<T[] | { result: T[] }>): T[] {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new LocationError();
  return Array.isArray(parsed.data) ? parsed.data : parsed.data.result;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR');

export function parseStates(payload: unknown): StateOption[] {
  const rows = items(payload, listOf(stateSchema));
  const states: StateOption[] = [];

  for (const row of rows) {
    const uf = normalizeState(row.acronym ?? row.initials ?? row.uf ?? '');
    if (!uf) continue;
    states.push({ uf, name: row.name.trim() });
  }

  if (states.length === 0) throw new LocationError();
  return states.sort(byName);
}

export function parseCities(payload: unknown): CityOption[] {
  const rows = items(payload, listOf(citySchema));
  const cities: CityOption[] = [];

  for (const row of rows) {
    const id = Number(row.id);
    if (!isCityId(id)) continue;
    cities.push({ id, name: normalizePlace(row.name) || row.name.trim() });
  }

  if (cities.length === 0) throw new LocationError();
  return cities.sort(byName);
}

export function parseDistricts(payload: unknown): DistrictOption[] {
  const rows = items(payload, listOf(districtSchema));
  const seen = new Set<string>();
  const districts: DistrictOption[] = [];

  for (const row of rows) {
    const name = normalizePlace(row.name) || row.name.trim();
    const key = normalizeSearch(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    districts.push({ name });
  }

  return districts.sort(byName);
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

export function districtsUrl(cityId: number): string {
  if (!isCityId(cityId)) throw new LocationError('Município inválido.');
  return `${BASE_URL}/districts/${cityId}`;
}

export const UF_CODES: readonly string[] = UF_OPTIONS.map((option) => option.id);

/* -------------------------------------------------------------------------
   Encadeamento Estado -> Municipio -> Bairro
   ------------------------------------------------------------------------- */

export interface LocationSelection {
  /** Sigla da UF. */
  state: string;
  /** Nome do municipio, como sera gravado. */
  city: string;
  /** Identificador do municipio: vive apenas durante o preenchimento. */
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
