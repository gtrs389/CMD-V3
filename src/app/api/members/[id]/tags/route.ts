import type { NextRequest } from 'next/server';
import { requireMemberAccess } from '@/lib/server/guard';
import { jsonOk, toErrorResponse } from '@/lib/server/http';
import { historicoDeTags } from '@/lib/server/tag.service';

/** Historico de tags da pessoa: colocadas, retiradas e apagadas do catalogo. */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/members/[id]/tags'>) {
  try {
    const { id } = await ctx.params;
    await requireMemberAccess('member.update', id);
    return jsonOk({ historico: await historicoDeTags(id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
