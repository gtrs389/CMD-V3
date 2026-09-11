import { CACHE_SECONDS, UF_CODES } from '@/lib/domain/location';
import { listDistrictsOfCity } from '@/lib/server/location.service';
import { locationFailure, locationResponse } from '../response';

/**
 * Bairros de um municipio.
 *
 * Recebe a UF e o nome do municipio; o identificador exigido pela Brasil
 * Aberto e resolvido aqui, na lista de municipios daquela UF. Nenhum dado da
 * pessoa passa por esta rota.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const uf = (params.get('uf') ?? '').toUpperCase();
  const city = (params.get('municipio') ?? '').trim().slice(0, 120);

  if (!UF_CODES.includes(uf)) return locationFailure(400, 'Estado inválido.');
  if (!city) return locationFailure(400, 'Município inválido.');

  return locationResponse(() => listDistrictsOfCity(uf, city), CACHE_SECONDS.districts);
}
