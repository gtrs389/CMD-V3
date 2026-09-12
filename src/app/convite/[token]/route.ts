import { NextResponse, type NextRequest } from 'next/server';
import { getInviteContext } from '@/lib/server/client.service';
import { expireDueInvites } from '@/lib/server/invite.service';
import { attachClaimCookie, readOrCreateClaim } from '@/lib/server/invite-claim';
import {
  attachInviteContext,
  attachPublicState,
  clearPublicContext,
} from '@/lib/server/public-context';

/**
 * Entrada do link de recrutamento.
 *
 * Esta rota NAO desenha nada: ela recebe o codigo do link, valida tudo no
 * servidor, guarda o contexto em cookie `HttpOnly` e devolve um redirect
 * 303 para `/`. O formulario e desenhado la, a partir do cookie — por isso a
 * barra de endereco fica so com o dominio, sem token, slug, query nem
 * fragmento, e nunca chega a exibir a URL do convite.
 *
 * Esta rota tambem NAO RESERVA o link.
 *
 * Ela e buscada por muita gente que nao e a pessoa convidada: ao enviar o
 * endereco por WhatsApp, Telegram, Facebook, Slack ou e-mail, o servidor do
 * aplicativo abre o link sozinho para montar a previa, e verificadores de
 * seguranca fazem o mesmo. Nenhum deles guarda cookie. Se a reserva
 * acontecesse aqui, o primeiro robo a passar ficaria com ela e a pessoa
 * convidada receberia "Link nao disponivel" sem nunca ter aberto nada.
 *
 * Por isso a reserva foi para `GET /api/public/convite`, que so acontece
 * quando o formulario carrega de verdade em um navegador: robo de previa nao
 * executa JavaScript e nunca chega la. O uso unico e a reserva pelo primeiro
 * aparelho continuam iguais, decididos de forma atomica no banco.
 *
 * O segredo da reserva continua nascendo aqui, no cookie `HttpOnly`, para o
 * navegador ja chegar em `/` com ele. O cookie de um robo morre com o robo.
 *
 * Nada e carregado antes do redirect: nenhuma imagem, script ou recurso
 * externo. A resposta tambem nao pode ser guardada em cache nem servir de
 * referer para lugar nenhum.
 *
 * Link vencido, consumido, revogado ou inexistente segue o mesmo caminho: o
 * estado publico vai para o cookie e a mensagem aparece em `/`, sem o token
 * na barra.
 */
export const dynamic = 'force-dynamic';

function redirectToRoot(request: NextRequest): NextResponse {
  const response = NextResponse.redirect(new URL('/', request.url), 303);

  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');

  // Abrir um link novo nunca herda o contexto do anterior.
  clearPublicContext(response);
  return response;
}

export async function GET(request: NextRequest, ctx: RouteContext<'/convite/[token]'>) {
  const { token } = await ctx.params;
  const response = redirectToRoot(request);

  const context = await getInviteContext(token).catch(() => null);

  // Prazo vencido, cadastro ja concluido ou token substituido.
  if (context?.finished) {
    await expireDueInvites().catch(() => undefined);
    attachPublicState(response, 'convite-expirado');
    return response;
  }

  // Inexistente, revogado ou com o recrutamento desligado.
  if (!context || !context.accepts) {
    attachPublicState(response, 'convite-indisponivel');
    return response;
  }

  const { expiresAt } = context.client.invite;

  // Segredo da reserva do primeiro acesso, com o MESMO valor de sempre: o
  // link vale para uma pessoa, e quem abrir o formulario primeiro continua
  // sendo o dono dele. Aqui o segredo apenas nasce; quem reserva de fato e a
  // rota que carrega o formulario.
  const claim = readOrCreateClaim(request);
  if (claim.isNew) attachClaimCookie(response, claim.secret, expiresAt);

  attachInviteContext(response, token, expiresAt);

  return response;
}
