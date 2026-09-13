import { NextResponse, type NextRequest } from 'next/server';
import { isPanelHost, isPublicPath, PUBLIC_EXIT_PATH } from '@/lib/domain/hosts';

/**
 * Separa o painel do dominio publico.
 *
 * No endereco publico — o que vai nos links enviados por WhatsApp — existem
 * apenas as portas de entrada desses links. Qualquer outro caminho, a
 * comecar pela tela de login, e mandado para `/saida`, que decide o destino
 * a partir do que o ADMIN configurou.
 *
 * Aqui nao ha consulta ao banco nem leitura de sessao: o middleware roda no
 * Edge, em toda requisicao, e a unica decisao que ele toma e "este caminho
 * pertence ao dominio publico?". Quem sabe o destino e a pagina `/saida`,
 * que roda no servidor normal.
 *
 * Sem `CMD_PANEL_HOST` configurada, `isPanelHost` responde sempre sim e este
 * middleware nao muda absolutamente nada.
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get('host');
  if (isPanelHost(host)) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const saida = NextResponse.redirect(new URL(PUBLIC_EXIT_PATH, request.url), 307);
  saida.headers.set('Cache-Control', 'no-store');
  return saida;
}

/**
 * Arquivos e recursos internos do Next ficam de fora: bloquea-los quebraria
 * o desenho das proprias telas publicas.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.[^/]+$).*)'],
};
