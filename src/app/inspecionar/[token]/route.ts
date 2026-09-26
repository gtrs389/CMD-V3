import { NextResponse, type NextRequest } from 'next/server';
import { homePathFor, INSPECTION_RETURN_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth/constants';
import { resolveSession } from '@/lib/server/auth.service';
import { claimImpersonation } from '@/lib/server/impersonation.service';

/**
 * Entrada da inspecao: o endereco de uso unico vira a sessao da pessoa.
 *
 * Como o convite e o acesso do time, esta rota nao desenha nada: decide no
 * servidor e devolve um redirect 303 para a pagina inicial daquele perfil,
 * deixando a barra de endereco so com o dominio. O endereco nao volta a
 * funcionar: o banco consome a autorizacao na mesma transacao que cria a
 * sessao.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, ctx: RouteContext<'/inspecionar/[token]'>) {
  const { token } = await ctx.params;

  const atual = request.cookies.get(SESSION_COOKIE)?.value;
  const claimed = await claimImpersonation(token).catch(() => null);

  // Autorizacao vencida, ja usada ou de alguem que saiu do ar: a pessoa que
  // abriu volta para onde estava, sem sessao nova e sem explicacao na URL.
  if (!claimed) {
    const recusa = NextResponse.redirect(new URL('/', request.url), 303);
    recusa.headers.set('Cache-Control', 'no-store');
    return recusa;
  }

  const user = await resolveSession(claimed.sessionToken);
  const destino = user ? homePathFor(user) : '/';

  const response = NextResponse.redirect(new URL(destino, request.url), 303);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');

  // Onde UM endereco serve tudo — desenvolvimento e previa —, a sessao do
  // ADMIN esta neste mesmo cookie e seria sobrescrita agora. Ela e guardada
  // para o clique em "Sair da inspeção" devolver o ADMIN ao painel dele em
  // vez de deixa-lo na tela de login. Em producao os enderecos sao
  // separados e este cookie nem chega a existir.
  if (atual) {
    const anterior = await resolveSession(atual).catch(() => null);
    if (anterior?.role === 'ADMIN') {
      response.cookies.set({
        name: INSPECTION_RETURN_COOKIE,
        value: atual,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: SESSION_MAX_AGE,
      });
    }
  }

  response.cookies.set({
    name: SESSION_COOKIE,
    value: claimed.sessionToken,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });

  return response;
}
