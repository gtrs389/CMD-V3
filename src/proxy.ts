import { NextResponse, type NextRequest } from 'next/server';
import { LOGIN_PATH, PROTECTED_PREFIXES, SESSION_COOKIE } from '@/lib/auth/constants';
import { isPanelHost, isPublicPath, PUBLIC_EXIT_PATH } from '@/lib/domain/hosts';

/**
 * Duas decisoes tomadas antes de qualquer pagina ser desenhada.
 *
 * 1. QUAL ENDERECO E ESTE. O sistema tem dois papeis: `painel.<dominio>`
 *    atende o painel inteiro, e o dominio publico — o que vai nos links
 *    enviados por WhatsApp — atende apenas as portas de entrada desses
 *    links. Qualquer outro caminho no dominio publico, a comecar pela tela
 *    de login, vai para `/saida`, que decide o destino a partir do que o
 *    ADMIN configurou.
 *
 *    Aqui nao ha consulta ao banco: este arquivo roda antes da aplicacao, em
 *    toda requisicao, e a unica pergunta que responde e "este caminho
 *    pertence ao dominio publico?". Quem sabe o destino e a pagina `/saida`,
 *    que roda no servidor normal.
 *
 *    Sem `CMD_PANEL_HOST` configurada, `isPanelHost` responde sempre sim e
 *    esta parte nao muda absolutamente nada.
 *
 * 2. TEM COOKIE DE SESSAO. Nas rotas administrativas, so olhamos a presenca
 *    do cookie: e uma melhoria de navegacao, nao a autorizacao. A validacao
 *    real da sessao acontece no servidor, em `src/app/(admin)/layout.tsx` e
 *    em cada rota de API, contra `cmd_sessions`.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 1. Dominio publico: so as portas de entrada dos links enviados.
  if (!isPanelHost(request.headers.get('host'))) {
    if (!isPublicPath(pathname)) {
      const saida = NextResponse.redirect(new URL(PUBLIC_EXIT_PATH, request.url), 307);
      saida.headers.set('Cache-Control', 'no-store');
      return saida;
    }
    return NextResponse.next();
  }

  // 2. Rotas administrativas: atalho de navegacao para quem nao tem cookie.
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

/**
 * Roda em tudo, menos nos arquivos.
 *
 * A separacao de dominio precisa valer para TODO caminho — a tela de login e
 * as rotas de API inclusive —, entao a lista estreita de antes nao serve
 * mais. Recursos internos do Next e arquivos com extensao ficam de fora:
 * bloquea-los quebraria o desenho das proprias telas publicas.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.[^/]+$).*)'],
};
