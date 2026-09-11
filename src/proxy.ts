import { NextResponse, type NextRequest } from 'next/server';
import { LOGIN_PATH, PROTECTED_PREFIXES, SESSION_COOKIE } from '@/lib/auth/constants';

/**
 * Redirecionamento das rotas administrativas.
 *
 * Aqui so olhamos a presenca do cookie: e uma melhoria de navegacao, nao a
 * autorizacao. A validacao real da sessao acontece no servidor, em
 * `src/app/(admin)/layout.tsx` e em cada rota de API, contra `cmd_sessions`.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!isProtected) return NextResponse.next();

  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = '';
    // Guarda apenas o caminho de destino. Nenhum dado pessoal vai para a URL.
    const target = `${pathname}${search}`;
    if (target && target !== LOGIN_PATH) url.searchParams.set('proximo', target);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/candidatos/:path*',
    '/recrutar/:path*',
    '/configuracoes/:path*',
    '/primeiro-acesso/:path*',
    '/clientes/:path*',
  ],
};
