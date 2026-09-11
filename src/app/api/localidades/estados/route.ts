import { CACHE_SECONDS } from '@/lib/domain/location';
import { listStates } from '@/lib/server/location.service';
import { locationResponse } from '../response';

/** Lista as 27 unidades da federacao. Dado publico, sem parametro de entrada. */
export async function GET() {
  return locationResponse(() => listStates(), CACHE_SECONDS.states);
}
