import { CACHE_SECONDS, toIbgeCode } from '@/lib/domain/location';
import { listDistricts } from '@/lib/server/location.service';
import { locationFailure, locationResponse } from '../../response';

/**
 * Bairros de um municipio, pelo codigo IBGE. O identificador interno da
 * Brasil Aberto pode vir em `?cidade=` como segunda tentativa. Os dois sao
 * inteiros positivos vindos da propria API: nenhum dado da pessoa passa aqui.
 */
export async function GET(request: Request, context: { params: Promise<{ ibge: string }> }) {
  const { ibge } = await context.params;
  const code = toIbgeCode(ibge);
  const cityId = toIbgeCode(new URL(request.url).searchParams.get('cidade'));

  if (code === null && cityId === null) return locationFailure(400, 'Município inválido.');

  return locationResponse(() => listDistricts(code, cityId), CACHE_SECONDS.districts);
}
