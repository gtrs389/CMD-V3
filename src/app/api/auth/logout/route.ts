import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/constants';
import { purgeExpiredSessions, revokeSession } from '@/lib/server/auth.service';
import { jsonOk } from '@/lib/server/http';

/** Encerra a sessao no banco e apaga o cookie. */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  try {
    await revokeSession(token);
    await purgeExpiredSessions();
  } catch (error) {
    // O cookie e removido de qualquer forma: sair nunca pode falhar.
    console.error('[auth] Falha ao revogar a sessao:', error);
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
}
