import { requirePermission } from '@/lib/server/guard';
import { jsonOk, toErrorResponse } from '@/lib/server/http';
import { salaDeApuracao } from '@/lib/server/apuracao.service';

/** Sala de Apuracao: resultado de cada cargo, a noite e a linha do tempo. */
export async function GET() {
  try {
    const user = await requirePermission('map.view');
    return jsonOk(await salaDeApuracao(user.id));
  } catch (error) {
    return toErrorResponse(error);
  }
}
