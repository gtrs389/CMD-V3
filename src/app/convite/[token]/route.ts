import { NextResponse, type NextRequest } from 'next/server';
import { getInviteContext } from '@/lib/server/client.service';
import { claimInvite, expireDueInvites } from '@/lib/server/invite.service';
import { recordInviteFirstAccess } from '@/lib/server/invite-access';
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
 * Nada e carregado antes do redirect: nenhuma imagem, script ou recurso
 * externo. A resposta tambem nao pode ser guardada em cache nem servir de
 * referer para lugar nenhum.
 *
 * Link vencido, consumido, revogado, reservado por outro aparelho ou
 * inexistente segue o mesmo caminho: o estado publico vai para o cookie e a
 * mensagem aparece em `/`, sem o token na barra.
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

  // Reserva do primeiro acesso, com o MESMO segredo de sempre: o link vale
  // para uma pessoa, e quem abriu primeiro continua sendo a dona dele.
  const claim = readOrCreateClaim(request);
  const outcome = await claimInvite(token, claim.hash).catch(() => 'GONE' as const);

  if (outcome === 'TAKEN') {
    attachPublicState(response, 'convite-reservado');
    return response;
  }
  if (outcome === 'GONE') {
    attachPublicState(response, 'convite-expirado');
    return response;
  }

  // Primeiro clique registrado AQUI, com o horario do banco e os sinais que
  // o servidor ja tem: User-Agent, idioma do cabecalho e o HMAC do IP quando
  // `DEVICE_IP_HMAC_KEY` existe. Um registro por convite e geracao —
  // atualizar a pagina no mesmo aparelho nao cria outro. Falhar aqui nao
  // atrapalha a abertura do link.
  await recordInviteFirstAccess(request, token);

  const { expiresAt } = context.client.invite;
  attachInviteContext(response, token, expiresAt);
  if (claim.isNew) attachClaimCookie(response, claim.secret, expiresAt);

  return response;
}
