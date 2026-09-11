import { CACHE_SECONDS, toCityId } from '@/lib/domain/location';
import { listDistricts } from '@/lib/server/location.service';
import { locationFailure, locationResponse } from '../../response';

/** Bairros de um municipio. O identificador precisa ser inteiro positivo. */
export async function GET(_request: Request, context: { params: Promise<{ cityId: string }> }) {
  const { cityId } = await context.params;
  const id = toCityId(cityId);

  if (id === null) return locationFailure(400, 'Município inválido.');

  return locationResponse(() => listDistricts(id), CACHE_SECONDS.districts);
}
