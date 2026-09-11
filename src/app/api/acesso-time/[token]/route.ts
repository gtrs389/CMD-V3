import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth/constants';
import { jsonError, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { GENERIC_LINK_ERROR, loginWithTeamPhone } from '@/lib/server/team-access.service';
import { teamPhoneLoginSchema } from '@/lib/validation/server.schema';

/**
 * Entrada do Administrador do time: link do time + telefone.
 *
 * O token vem do endereco e nunca do corpo. O telefone e comparado apenas na
 * forma normalizada e somente dentro do time que o link identificou: sem o
 * link correto, telefone nenhum autentica. Nem telefone, nem token, nem URL
 * completa aparecem em log, e a resposta e sempre a mesma para qualquer
 * telefone que nao sirva.
 */
export async function POST(request: NextRequest, ctx: RouteContext<'/api/acesso-time/[token]'>) {
  try {
    const { token } = await ctx.params;
    const { phone } = await readJson(request, teamPhoneLoginSchema);
    const result = await loginWithTeamPhone(token, phone);

    if (!result.user || !result.sessionToken) {
      const status = result.throttled ? 429 : result.message === GENERIC_LINK_ERROR ? 410 : 401;
      return jsonError(status, result.message ?? GENERIC_LINK_ERROR);
    }

    const response = jsonOk({ user: result.user });
    response.cookies.set({
      name: SESSION_COOKIE,
      value: result.sessionToken,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
