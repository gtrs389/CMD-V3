import { NextResponse, type NextRequest } from 'next/server';
import {
  DEFAULT_AUTHENTICATED_PATH,
  LOGIN_PATH,
  PROTECTED_PREFIXES,
  SESSION_COOKIE,
} from '@/lib/auth/constants';
import { readSessionToken } from '@/lib/auth/session';
import { hasPanelAccess } from '@/lib/permissions';

/**
 * Protecao das rotas administrativas.
 *
 * Executa antes da renderizacao: sem sessao valida com permissao de painel,
 * o acesso direto a qualquer rota administrativa e redirecionado ao login.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const isLogin = pathname === LOGIN_PATH;

  if (!isProtected && !isLogin) return NextResponse.next();

  const payload = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const authenticated = payload !== null && hasPanelAccess(payload);

  if (isProtected && !authenticated) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = '';
    // Guarda apenas o caminho de destino. Nenhum dado pessoal vai para a URL.
    const target = `${pathname}${search}`;
    if (target && target !== LOGIN_PATH) url.searchParams.set('proximo', target);

    const response = NextResponse.redirect(url);
    if (payload === null) response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  if (isLogin && authenticated) {
    const url = request.nextUrl.clone();
    url.pathname = DEFAULT_AUTHENTICATED_PATH;
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/login', '/dashboard/:path*', '/clientes/:path*'],
};
