import { CACHE_SECONDS, toIbgeCode } from '@/lib/domain/location';
import { listDistricts } from '@/lib/server/location.service';
import { locationFailure, locationResponse } from '../../response';

/** Bairros de um municipio, pelo codigo IBGE (inteiro positivo). */
export async function GET(_request: Request, context: { params: Promise<{ ibge: string }> }) {
  const { ibge } = await context.params;
  const code = toIbgeCode(ibge);

  if (code === null) return locationFailure(400, 'Município inválido.');

  return locationResponse(() => listDistricts(code), CACHE_SECONDS.districts);
}
