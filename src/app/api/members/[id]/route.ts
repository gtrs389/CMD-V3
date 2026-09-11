import type { NextRequest } from 'next/server';
import { requireMemberAccess } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { memberUpdateSchema } from '@/lib/validation/server.schema';
import { deleteMember, updateMember } from '@/lib/server/member.service';

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/members/[id]'>) {
  try {
    const { id } = await ctx.params;
    await requireMemberAccess('member.update', id);
    const input = await readJson(request, memberUpdateSchema);
    return jsonOk({ member: await updateMember(id, input) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<'/api/members/[id]'>) {
  try {
    const { id } = await ctx.params;
    await requireMemberAccess('member.delete', id);
    await deleteMember(id);
    return jsonOk({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
