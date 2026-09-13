import type { NextRequest } from 'next/server';
import { requireMemberAccess } from '@/lib/server/guard';
import { jsonOk, notFound, readJson, toErrorResponse } from '@/lib/server/http';
import { memberUpdateSchema } from '@/lib/validation/server.schema';
import { deleteMember, getMember, updateMember } from '@/lib/server/member.service';
import { assertTeamPhoneAvailable, syncMemberAccess } from '@/lib/server/user.service';
import { getClient } from '@/lib/server/client.service';
import { clientForSession } from '@/lib/server/form-visibility';

/**
 * A ficha de um integrante, com o time a que ela pertence.
 *
 * Existe para o MAPA: la a pessoa e um pino, e abrir a ficha nao pode
 * significar sair da tela e perder a posicao, o zoom e o filtro. O mapa nao
 * tem a lista da equipe carregada — ele desenha pinos de varios times ao
 * mesmo tempo —, entao precisa pedir a ficha pelo identificador.
 *
 * O time vem junto porque a ficha e desenhada com o formulario dele: sao os
 * rotulos que dao nome as respostas.
 *
 * `requireMemberAccess` decide o alcance: ADMIN chega em qualquer
 * integrante, o Administrador do time apenas nos do proprio time, e a
 * EQUIPE somente em quem se cadastrou pelo proprio link. O identificador da
 * URL nao amplia nada.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/members/[id]'>) {
  try {
    const { id } = await ctx.params;
    const user = await requireMemberAccess('member.view', id);

    const member = await getMember(id);
    if (!member) throw notFound('Integrante não encontrado.');

    const client = await getClient(member.clientId);
    if (!client) throw notFound('Time não encontrado.');

    return jsonOk({ member, client: clientForSession(user, client) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

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
