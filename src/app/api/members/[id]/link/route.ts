import type { NextRequest } from 'next/server';
import { requireMemberAccess } from '@/lib/server/guard';
import { jsonOk, toErrorResponse } from '@/lib/server/http';
import { getMemberSignupLink } from '@/lib/server/member-link.service';
import { publicLink } from '@/lib/server/public-origin';
import { invitePath } from '@/lib/utils/url';

/**
 * Link de cadastro pelo qual o integrante entrou.
 *
 * Exclusivo do ADMIN geral, pela mesma permissao dos sinais do aparelho:
 * Administrador do time e EQUIPE recebem 403.
 */
export async function GET(request: NextRequest, ctx: RouteContext<'/api/members/[id]/link'>) {
  try {
    const { id } = await ctx.params;
    await requireMemberAccess('device.view', id);

    const found = await getMemberSignupLink(id);
    if (!found) return jsonOk({ link: null });

    const { token, ...info } = found;
    const url = token ? await publicLink(request, invitePath(token)) : null;
    return jsonOk({ link: { ...info, url } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
