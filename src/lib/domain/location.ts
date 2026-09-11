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
  /** Identificador da Brasil Aberto. Usado apenas para buscar os bairros. */
  id: number;
  /** Codigo IBGE, quando a resposta traz. Tambem so serve para os bairros. */
  ibge: number | null;
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

/** A API devolve `shortName`; os demais nomes cobrem variacoes da resposta. */
const stateSchema = z.object({
  name: z.string().min(1),
  shortName: z.string().length(2).optional(),
  acronym: z.string().length(2).optional(),
  initials: z.string().length(2).optional(),
  uf: z.string().length(2).optional(),
});

/**
 * Os bairros sao consultados pelo codigo IBGE e, se preciso, pelo
 * identificador interno: guardamos os dois quando a resposta traz ambos.
 */
const citySchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  ibgeId: z.union([z.number(), z.string()]).optional(),
  name: z.string().min(1),
});

/** O nome do bairro pode chegar em `name`, `district` ou como texto solto. */
const districtSchema = z.union([
  z.string().min(1),
  z.object({
    name: z.string().min(1).optional(),
    district: z.string().min(1).optional(),
    districtName: z.string().min(1).optional(),
  }),
]);

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
    const uf = normalizeState(row.shortName ?? row.acronym ?? row.initials ?? row.uf ?? '');
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
    const ibge = toIbgeCode(row.ibgeId ?? null);
    const own = toIbgeCode(row.id ?? null);
    const id = own ?? ibge;
    if (id === null) continue;
    cities.push({ id, ibge, name: normalizePlace(row.name) || row.name.trim() });
  }

  if (cities.length === 0) throw new LocationError();
  return cities.sort(byName);
}

export function parseDistricts(payload: unknown): DistrictOption[] {
  // Alem da lista direta, a resposta pode trazer os bairros dentro do result.
  const nested =
    payload && typeof payload === 'object' && 'result' in payload
      ? (payload as { result?: { districts?: unknown } }).result
      : null;
  const source =
    nested && typeof nested === 'object' && !Array.isArray(nested) && 'districts' in nested
      ? { result: nested.districts }
      : payload;

  const rows = items(source, listOf(districtSchema));
  const seen = new Set<string>();
  const districts: DistrictOption[] = [];

  for (const row of rows) {
    const raw = typeof row === 'string' ? row : (row.name ?? row.district ?? row.districtName ?? '');
    const name = normalizePlace(raw) || raw.trim();
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

/** Aceita apenas inteiro positivo. O codigo vem sempre da propria API. */
export function isIbgeCode(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function toIbgeCode(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return isIbgeCode(parsed) ? parsed : null;
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

export function districtsUrl(ibgeCode: number): string {
  if (!isIbgeCode(ibgeCode)) throw new LocationError('Município inválido.');
  return `${BASE_URL}/districts-by-ibge-code/${ibgeCode}`;
}

/** Caminho alternativo, pelo identificador interno da Brasil Aberto. */
export function districtsByCityUrl(cityId: number): string {
  if (!isIbgeCode(cityId)) throw new LocationError('Município inválido.');
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
  /** Identificador da Brasil Aberto: vive apenas durante o preenchimento. */
  cityId: number | null;
  /** Codigo IBGE do municipio, quando conhecido. Tambem nao e gravado. */
  cityIbge: number | null;
  /** Nome do bairro, como sera gravado. */
  district: string;
}

export const EMPTY_SELECTION: LocationSelection = {
  state: '',
  city: '',
  cityId: null,
  cityIbge: null,
  district: '',
};

/** Trocar o estado limpa municipio e bairro. */
export function selectState(current: LocationSelection, uf: string): LocationSelection {
  const state = normalizeState(uf) ?? '';
  if (state === current.state) return current;
  return { state, city: '', cityId: null, cityIbge: null, district: '' };
}

/** Trocar o municipio limpa o bairro. */
export function selectCity(current: LocationSelection, city: CityOption | null): LocationSelection {
  return {
    ...current,
    city: city?.name ?? '',
    cityId: city?.id ?? null,
    cityIbge: city?.ibge ?? null,
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
