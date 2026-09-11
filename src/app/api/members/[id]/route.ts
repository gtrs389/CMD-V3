import type { NextRequest } from 'next/server';
import { requireMemberAccess } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { memberUpdateSchema } from '@/lib/validation/server.schema';
import { deleteMember, updateMember } from '@/lib/server/member.service';
import { assertMemberEmailFree, syncMemberLogin } from '@/lib/server/user.service';

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/members/[id]'>) {
  try {
    const { id } = await ctx.params;
    await requireMemberAccess('member.update', id);
    const input = await readJson(request, memberUpdateSchema);

    // O e-mail e a credencial do integrante: conflito barra antes de gravar.
    if (input.email !== undefined) await assertMemberEmailFree(input.email, id);

    const member = await updateMember(id, input);

    // Login do integrante acompanha o cadastro. Trocar o e-mail derruba as
    // sessoes antigas.
    await syncMemberLogin(id, { name: input.name, email: input.email });

    return jsonOk({ member });
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
