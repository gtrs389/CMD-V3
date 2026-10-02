import type { NextRequest } from 'next/server';
import { requireClientAccess } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { inconsistenciasDesligadasSchema } from '@/lib/validation/server.schema';
import { setInconsistenciasDesligadas } from '@/lib/server/client.service';

/**
 * Quais verificacoes o quadro de Inconsistencias mostra neste time
 * (migration 053). Recebe a lista inteira do que fica DESLIGADO.
 *
 * Exclusivo do ADMIN geral (`form.manage`), com o escopo do time conferido:
 * esconder uma verificacao muda o que o Administrador do time enxerga, e
 * quem decide isso e quem administra o sistema.
 */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/clients/[id]/inconsistencias'>,
) {
  try {
    const { id } = await ctx.params;
    await requireClientAccess('form.manage', id);

    const { desligadas } = await readJson(request, inconsistenciasDesligadasSchema);

    return jsonOk({ client: await setInconsistenciasDesligadas(id, desligadas) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
