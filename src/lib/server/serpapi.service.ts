import 'server-only';
import {
  parsePlace,
  providerError,
  type AddressParts,
  type MapErrorCode,
  type MapPlace,
} from '@/lib/domain/map-location';

/**
 * Coordenadas pelo Google Maps, via SerpAPI.
 *
 * Somente o servidor fala com o provedor. A chave vive em `SERPAPI_API_KEY`
 * (sem `NEXT_PUBLIC_`) e vai apenas no parametro da consulta.
 *
 * O que sai daqui e endereco: local, logradouro, bairro, municipio e UF.
 * Nome, CPF, telefone, nascimento, nome da mae, titulo, zona, secao e
 * identificadores internos nunca entram na consulta.
 *
 * Nada e registrado em log: nem a URL (que carrega a chave), nem a consulta,
 * nem a resposta. Cada chamada e cobrada, entao este modulo nunca repete
 * sozinho.
 */

const ENDPOINT = 'https://serpapi.com/search.json';
const TIMEOUT_MS = 15_000;

export class MapLookupError extends Error {
  readonly code: MapErrorCode;

  constructor(code: MapErrorCode) {
    super(code);
    this.name = 'MapLookupError';
    this.code = code;
  }
}

function apiKey(): string {
  const key = process.env.SERPAPI_API_KEY?.trim();
  if (!key) throw new MapLookupError('MISSING_CONFIG');
  return key;
}

function codeFor(status: number): MapErrorCode {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'INVALID_KEY';
    case 403:
      return 'NO_ACCESS';
    case 429:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'UNEXPECTED';
  }
}

/**
 * Busca as coordenadas de um endereco.
 *
 * Sem `ll` de proposito: um ponto de referencia de outra regiao deslocaria a
 * busca. O cache do proprio provedor fica ativo (nunca `no_cache=true`).
 * Devolve `null` quando nao ha resultado confiavel: NOT_FOUND, jamais um
 * palpite de coordenada.
 */
export async function lookupPlace(query: string, expected: AddressParts): Promise<MapPlace | null> {
  const credential = apiKey();

  const params = new URLSearchParams({
    engine: 'google_maps',
    type: 'search',
    q: query,
    google_domain: 'google.com.br',
    gl: 'br',
    hl: 'pt-br',
    api_key: credential,
  });

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new MapLookupError(
      error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT' : 'PROVIDER_UNAVAILABLE',
    );
  }

  if (!response.ok) throw new MapLookupError(codeFor(response.status));

  const payload = await response.json().catch(() => null);
  if (payload === null) throw new MapLookupError('UNEXPECTED');
  if (providerError(payload)) throw new MapLookupError('UNEXPECTED');

  return parsePlace(payload, expected);
}
