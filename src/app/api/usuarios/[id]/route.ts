import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { assertNotSelf, setUserActive } from '@/lib/server/user.service';

const activeSchema = z.object({ isActive: z.boolean() });

/** Ativa ou desativa o acesso. O ADMIN nunca desativa a propria conta. */
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/usuarios/[id]'>) {
  try {
    const current = await requirePermission('settings.manage');
    const { id } = await ctx.params;
    const { isActive } = await readJson(request, activeSchema);

    assertNotSelf(current.id, id);
    await setUserActive(id, isActive);

    return jsonOk({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
