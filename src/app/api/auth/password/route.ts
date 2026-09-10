import type { NextRequest } from 'next/server';
import { changePassword, currentUser } from '@/lib/server/auth.service';
import { changePasswordSchema } from '@/lib/validation/auth.schema';
import { SESSION_COOKIE } from '@/lib/auth/constants';
import { jsonError, jsonOk, readJson, toErrorResponse, unauthorized } from '@/lib/server/http';

/**
 * Troca da propria senha.
 *
 * O usuario vem exclusivamente da sessao: o corpo da requisicao nao escolhe
 * quem tem a senha alterada. Ao final, todas as sessoes sao revogadas no banco
 * e o cookie desta e apagado, obrigando a entrar de novo.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) throw unauthorized();

    const input = await readJson(request, changePasswordSchema);
    const result = await changePassword(user.id, input.currentPassword, input.newPassword);

    if (!result.ok) {
      return jsonError(400, result.message ?? 'Não foi possível alterar a senha.');
    }

    const response = jsonOk({ ok: true });
    response.cookies.set({
      name: SESSION_COOKIE,
      value: '',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
