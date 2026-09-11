import { CACHE_SECONDS, toCityId } from '@/lib/domain/location';
import { listStreets } from '@/lib/server/location.service';
import { locationFailure, locationResponse } from '../../response';

/**
 * Ruas de um bairro, pelo identificador devolvido na consulta de bairros.
 *
 * E sempre um inteiro positivo vindo da propria API: nome de bairro, nome de
 * municipio, codigo IBGE ou qualquer outro identificador nao servem aqui.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ districtId: string }> },
) {
  const { districtId } = await context.params;
  const id = toCityId(districtId);

  if (id === null) return locationFailure(400, 'Bairro inválido.');

  return locationResponse(() => listStreets(id), CACHE_SECONDS.streets);
}
