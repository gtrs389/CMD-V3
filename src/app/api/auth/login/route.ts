import { NextResponse } from 'next/server';
import { loginSchema } from '@/lib/validation/auth.schema';
import { verifyCredentials } from '@/lib/auth/credentials';
import { createSessionToken } from '@/lib/auth/session';
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth/constants';

const GENERIC_ERROR = 'E-mail ou senha invalidos.';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Requisicao invalida.' }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: GENERIC_ERROR }, { status: 400 });
  }

  const { user } = verifyCredentials(parsed.data.email, parsed.data.password);
  if (!user) {
    // Mensagem generica: nao revela se o e-mail existe.
    return NextResponse.json({ message: GENERIC_ERROR }, { status: 401 });
  }

  const token = await createSessionToken(user);
  const response = NextResponse.json({ user });

  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });

  return response;
}
