import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, toErrorResponse } from '@/lib/server/http';
import { listMembersByClient } from '@/lib/server/member.service';

/** Equipe de um cliente. */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/clients/[id]/members'>) {
  try {
    await requirePermission('member.view');
    const { id } = await ctx.params;
    return jsonOk({ members: await listMembersByClient(id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
