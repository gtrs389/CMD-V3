import { CACHE_SECONDS, UF_CODES } from '@/lib/domain/location';
import { listCities } from '@/lib/server/location.service';
import { locationFailure, locationResponse } from '../../response';

/** Municipios de uma UF. A sigla e conferida contra as 27 do pais. */
export async function GET(_request: Request, context: { params: Promise<{ uf: string }> }) {
  const { uf } = await context.params;
  const code = (uf ?? '').toUpperCase();

  if (!UF_CODES.includes(code)) return locationFailure(400, 'Estado inválido.');

  return locationResponse(() => listCities(code), CACHE_SECONDS.cities);
}
