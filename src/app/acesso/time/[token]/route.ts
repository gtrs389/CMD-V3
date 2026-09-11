import { NextResponse, type NextRequest } from 'next/server';
import { resolveTeamAccess } from '@/lib/server/team-access.service';
import {
  attachPublicState,
  attachTeamAccessContext,
  clearPublicContext,
} from '@/lib/server/public-context';

/**
 * Entrada do link de acesso ao painel (Administradores do time e equipe).
 *
 * Como no convite, esta rota nao desenha nada: valida o endereco no
 * servidor, guarda o contexto em cookie `HttpOnly` de 15 minutos e devolve
 * um redirect 303 para `/`, onde a tela do telefone e desenhada. A barra de
 * endereco fica so com o dominio.
 *
 * Este link NAO e consumido: ele continua valendo para todas as pessoas
 * ativas daquele publico. A regra de uso unico e do link de recrutamento e
 * nao se aplica aqui.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, ctx: RouteContext<'/acesso/time/[token]'>) {
  const { token } = await ctx.params;

  const response = NextResponse.redirect(new URL('/', request.url), 303);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');

  // Abrir um link novo nunca herda o contexto do anterior.
  clearPublicContext(response);

  const context = await resolveTeamAccess(token).catch(() => null);

  // Inexistente, revogado ou substituido: a mensagem neutra aparece em `/`.
  if (!context) {
    attachPublicState(response, 'acesso-indisponivel');
    return response;
  }

  attachTeamAccessContext(response, token);
  return response;
}
