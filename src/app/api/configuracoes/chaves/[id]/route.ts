import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, toErrorResponse } from '@/lib/server/http';
import { revokeApiKey } from '@/lib/server/api-key.service';

/**
 * Revoga uma chave da API. EXCLUSIVO do ADMIN geral.
 *
 * A chave para de autenticar no mesmo instante; nada e apagado. A linha
 * permanece com quem revogou, quando, e quantas chamadas ela fez enquanto
 * valia. Os links ja gerados por ela continuam valendo — revogar a chave nao
 * derruba link nenhum, e para isso existe `DELETE /api/v1/links/{id}`.
 */
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<'/api/configuracoes/chaves/[id]'>,
) {
  try {
    const user = await requirePermission('settings.manage');
    if (user.role !== 'ADMIN') throw forbidden();

    const { id } = await ctx.params;
    return jsonOk({ key: await revokeApiKey(id, { id: user.id, name: user.name }) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
