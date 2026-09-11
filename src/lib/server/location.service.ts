import 'server-only';
import {
  CACHE_SECONDS,
  findCity,
  LOCATION_TIMEOUT_MS,
  LocationError,
  citiesUrl,
  districtsUrl,
  parseCities,
  parseDistricts,
  parseStates,
  statesUrl,
  type CityOption,
  type DistrictOption,
  type StateOption,
} from '@/lib/domain/location';

/**
 * Consulta as localidades na Brasil Aberto.
 *
 * Somente o servidor fala com a API externa e apenas dois dados saem daqui:
 * a sigla da UF e o identificador do municipio. Nenhum dado da pessoa
 * (nome, CPF, titulo, telefone) e enviado ou registrado em log.
 *
 * A chave vive apenas aqui, em `BRASIL_ABERTO_API_KEY` (sem `NEXT_PUBLIC_`),
 * e segue no cabecalho `Authorization: Bearer`. Ela nunca vai para o
 * navegador, para a resposta das rotas internas ou para qualquer log. Sem a
 * variavel configurada, nenhuma consulta e feita.
 */

/** Falha de configuracao: a chave da API nao esta definida no servidor. */
export class LocationConfigError extends Error {
  constructor() {
    super('Serviço de localidades indisponível. Configuração ausente.');
    this.name = 'LocationConfigError';
  }
}

function authorization(): string {
  const key = process.env.BRASIL_ABERTO_API_KEY?.trim();
  if (!key) throw new LocationConfigError();
  return `Bearer ${key}`;
}

async function load<T>(url: string, revalidate: number, parse: (payload: unknown) => T): Promise<T> {
  // Calculado antes do `try`: a ausencia da chave nao vira erro de rede.
  const credential = authorization();
  let response: Response;

  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: credential },
      signal: AbortSignal.timeout(LOCATION_TIMEOUT_MS),
      next: { revalidate },
    });
  } catch {
    // A causa original fica fora da resposta e fora do log.
    logFailure(url, 0);
    throw new LocationError();
  }

  if (!response.ok) {
    logFailure(url, response.status);
    throw new LocationError();
  }

  const payload = await response.json().catch(() => null);

  try {
    return parse(payload);
  } catch {
    logFailure(url, response.status, 'formato inesperado');
    throw new LocationError();
  }
}

/**
 * Registra apenas o caminho consultado e o codigo devolvido.
 * Nunca entra aqui a chave da API nem qualquer dado da pessoa.
 */
function logFailure(url: string, status: number, detail = 'falha na consulta'): void {
  console.warn('[cmd] localidades: %s (%s) em %s', detail, status || 'sem resposta', endpoint(url));
}

/** Caminho sem dominio e sem parametros de consulta, para o log. */
function endpoint(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return 'desconhecido';
  }
}

export function listStates(): Promise<StateOption[]> {
  return load(statesUrl(), CACHE_SECONDS.states, parseStates);
}

export function listCities(uf: string): Promise<CityOption[]> {
  return load(citiesUrl(uf), CACHE_SECONDS.cities, parseCities);
}

/** Bairros do municipio, pelo identificador interno (`city.id`). */
export function listDistricts(cityId: number): Promise<DistrictOption[]> {
  return load(districtsUrl(cityId), CACHE_SECONDS.districts, parseDistricts);
}

/**
 * Bairros a partir da UF e do nome do municipio.
 *
 * O `id` vem sempre da lista de municipios lida agora no servidor, nunca de
 * algo guardado no navegador. Municipio desconhecido devolve lista vazia: o
 * valor ja gravado continua na tela.
 */
export async function listDistrictsOfCity(
  uf: string,
  cityName: string,
): Promise<DistrictOption[]> {
  const city = findCity(await listCities(uf), cityName);
  if (!city) return [];
  return listDistricts(city.id);
}
