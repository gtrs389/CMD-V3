import { NextResponse, type NextRequest } from 'next/server';
import { LOGIN_PATH, PROTECTED_PREFIXES, SESSION_COOKIE } from '@/lib/auth/constants';
import {
  isAdminHost,
  isAdminOnlyPath,
  isPanelHost,
  isPublicEntryPath,
  isPublicPath,
  servesAdminLogin,
  PUBLIC_EXIT_PATH,
} from '@/lib/domain/hosts';

/** Manda para a saida que o ADMIN configurou, sem cache. */
function paraSaida(request: NextRequest): NextResponse {
  return semCache(request, PUBLIC_EXIT_PATH);
}

function semCache(request: NextRequest, destino: string): NextResponse {
  const resposta = NextResponse.redirect(new URL(destino, request.url), 307);
  resposta.headers.set('Cache-Control', 'no-store');
  return resposta;
}

/**
 * Duas decisoes tomadas antes de qualquer pagina ser desenhada.
 *
 * 1. QUAL ENDERECO E ESTE. O sistema tem tres papeis:
 *
 *      - o endereco EXCLUSIVO DO ADMIN geral serve o painel e mais nada:
 *        link de cadastro, Formulario 2 e acesso do time nao abrem nele.
 *        Quem pode USAR esse painel e outra conversa, decidida no servidor
 *        contra a sessao (`currentUser`), e nao aqui: este arquivo roda
 *        antes da aplicacao e so enxerga um cookie opaco;
 *      - `painel.<dominio>` atende o painel do time;
 *      - o dominio publico — o que vai nos links enviados por WhatsApp —
 *        atende apenas as portas de entrada desses links. Qualquer outro
 *        caminho nele, a comecar pela tela de login, vai para `/saida`, que
 *        decide o destino a partir do que o ADMIN configurou.
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
  const host = request.headers.get('host');

  // 1a. Endereco exclusivo do ADMIN: nenhuma porta publica e servida. Um
  // link de cadastro colado neste endereco nao abre formulario nenhum — ele
  // pertence ao dominio publico, e e de la que as pessoas o recebem.
  if (isAdminHost(host) && isPublicEntryPath(pathname)) {
    return paraSaida(request);
  }

  // 1b. A porta do ADMIN geral — e-mail e senha — existe em UM endereco. Em
  // `painel.` e no dominio publico ela nao e servida: quem digita aqueles
  // enderecos nao pode cair na tela de login do ADMIN.
  //
  // Em `painel.` e no dominio publico o destino e o mesmo: a saida que o
  // ADMIN configurou. Digitar o endereco no escuro nao revela que existe um
  // sistema atras dele.
  if (isAdminOnlyPath(pathname) && !servesAdminLogin(host)) {
    return paraSaida(request);
  }

  // 1c. Dominio publico: so as portas de entrada dos links enviados.
  if (!isPanelHost(host)) {
    if (!isPublicPath(pathname)) return paraSaida(request);
    return NextResponse.next();
  }

  // 2. Rotas administrativas: atalho de navegacao para quem nao tem cookie.
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!isProtected) return NextResponse.next();

  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!hasCookie) {
    // Em `painel.` nao ha tela de e-mail e senha: a porta do time e o LINK
    // do time. Sem sessao, o destino e a saida — mandar para `/login` so
    // trocaria um redirecionamento por outro.
    if (!servesAdminLogin(host)) return paraSaida(request);

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
