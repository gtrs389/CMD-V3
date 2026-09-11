import type { NextRequest } from 'next/server';
import { requireClientAccess } from '@/lib/server/guard';
import { jsonOk, toErrorResponse } from '@/lib/server/http';
import { listMembersByClient } from '@/lib/server/member.service';

/** Equipe de um cliente. */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/clients/[id]/members'>) {
  try {
    const { id } = await ctx.params;
    await requireClientAccess('member.view', id);
    return jsonOk({ members: await listMembersByClient(id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
