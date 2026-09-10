import type { NextRequest } from 'next/server';
import { loginSchema } from '@/lib/validation/auth.schema';
import { login } from '@/lib/server/auth.service';
import { GENERIC_LOGIN_ERROR, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth/constants';
import { jsonError, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';

/**
 * Login proprio, sobre `cmd_users` e `cmd_sessions`.
 * O cookie recebe o token original; o banco guarda apenas o hash.
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await readJson(request, loginSchema);
    const result = await login(email, password);

    if (!result.user || !result.token) {
      return jsonError(result.throttled ? 429 : 401, result.message ?? GENERIC_LOGIN_ERROR);
    }

    const response = jsonOk({ user: result.user });
    response.cookies.set({
      name: SESSION_COOKIE,
      value: result.token,
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
