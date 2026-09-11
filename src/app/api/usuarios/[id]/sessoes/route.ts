import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, toErrorResponse } from '@/lib/server/http';
import { assertNotSelf, revokeUserSessions } from '@/lib/server/user.service';

/** Encerra todas as sessoes do usuario, menos as do proprio ADMIN atual. */
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<'/api/usuarios/[id]/sessoes'>,
) {
  try {
    const current = await requirePermission('settings.manage');
    const { id } = await ctx.params;

    assertNotSelf(current.id, id);
    return jsonOk({ revoked: await revokeUserSessions(id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
