import 'server-only';
import {
  CACHE_SECONDS,
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
 */

async function load<T>(url: string, revalidate: number, parse: (payload: unknown) => T): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(LOCATION_TIMEOUT_MS),
      next: { revalidate },
    });
  } catch {
    // A causa original fica fora da resposta e fora do log.
    throw new LocationError();
  }

  if (!response.ok) throw new LocationError();

  const payload = await response.json().catch(() => null);
  return parse(payload);
}

export function listStates(): Promise<StateOption[]> {
  return load(statesUrl(), CACHE_SECONDS.states, parseStates);
}

export function listCities(uf: string): Promise<CityOption[]> {
  return load(citiesUrl(uf), CACHE_SECONDS.cities, parseCities);
}

export function listDistricts(cityId: number): Promise<DistrictOption[]> {
  return load(districtsUrl(cityId), CACHE_SECONDS.districts, parseDistricts);
}
