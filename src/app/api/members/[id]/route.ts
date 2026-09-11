import type { NextRequest } from 'next/server';
import { requireMemberAccess } from '@/lib/server/guard';
import { jsonOk, notFound, readJson, toErrorResponse } from '@/lib/server/http';
import { memberUpdateSchema } from '@/lib/validation/server.schema';
import { deleteMember, getMember, updateMember } from '@/lib/server/member.service';
import { assertTeamPhoneAvailable, syncMemberAccess } from '@/lib/server/user.service';

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/members/[id]'>) {
  try {
    const { id } = await ctx.params;
    await requireMemberAccess('member.update', id);
    const input = await readJson(request, memberUpdateSchema);

    const current = await getMember(id);
    if (!current) throw notFound('Integrante não encontrado.');

    // O telefone e o que identifica o integrante no acesso: conflito dentro
    // do time barra antes de gravar.
    if (input.phone !== undefined) {
      await assertTeamPhoneAvailable(current.clientId, input.phone, { memberId: id });
    }

    const member = await updateMember(id, input);

    // O acesso acompanha o cadastro. Trocar o telefone revoga o aparelho e
    // derruba as sessoes; corrigir um telefone que faltava ou estava
    // duplicado libera o acesso que estava bloqueado.
    await syncMemberAccess(id, {
      clientId: member.clientId,
      name: input.name,
      phone: input.phone,
    });

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
