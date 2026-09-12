import { NextResponse, type NextRequest } from 'next/server';
import { getInviteContext } from '@/lib/server/client.service';
import { expireDueInvites } from '@/lib/server/invite.service';
import { attachClaimCookie, readOrCreateClaim } from '@/lib/server/invite-claim';
import {
  attachClickCookie,
  clickSource,
  recordInviteClick,
  setInviteClickOutcome,
  type ClickOutcome,
} from '@/lib/server/invite-click';
import {
  attachInviteContext,
  attachPublicState,
  clearPublicContext,
  type PublicState,
} from '@/lib/server/public-context';

/**
 * Entrada do link de recrutamento.
 *
 * Esta rota NAO desenha nada: ela recebe o codigo do link, registra a
 * abertura, valida tudo no servidor, guarda o contexto em cookie `HttpOnly`
 * e devolve um redirect 303 para `/`. O formulario e desenhado la, a partir
 * do cookie — por isso a barra de endereco fica so com o dominio, sem token,
 * slug, query nem fragmento.
 *
 * ORDEM (migration 021): o clique e gravado ANTES de qualquer verificacao de
 * disponibilidade. Link expirado, reservado por outro aparelho, consumido ou
 * revogado tambem produz registro — com o instante do banco, a situacao
 * encontrada e os sinais do aparelho —, e mesmo assim nao libera nada.
 * Registrar NUNCA reativa, renova nem reserva: a funcao do banco so observa.
 *
 * Cada abertura desta rota e um clique novo e independente: 1o, 2o, 3o.
 * Atualizar a pagina limpa em `/` nao passa por aqui e, portanto, nao conta.
 *
 * Esta rota tambem NAO RESERVA o link. Ela e buscada por muita gente que nao
 * e a pessoa convidada: ao enviar o endereco por WhatsApp, Telegram,
 * Facebook, Slack ou e-mail, o servidor do aplicativo abre o link sozinho
 * para montar a previa. Esses acessos entram como "Pre-visualizacao
 * automatica", sem numero de clique humano, e nao reservam, nao expiram e
 * nao consomem nada. A reserva de verdade acontece em
 * `GET /api/public/convite`, que so roda quando o formulario carrega em um
 * navegador.
 *
 * Nada e carregado antes do redirect: nenhuma imagem, script ou recurso
 * externo. A resposta nao pode ser guardada em cache nem servir de referer.
 */
export const dynamic = 'force-dynamic';

/**
 * Tela publica correspondente a cada desfecho.
 *
 * Nada aqui revela que houve rastreamento, nem mostra outros acessos: sao as
 * mesmas tres telas de sempre.
 */
function stateFor(outcome: ClickOutcome): PublicState {
  // Vencido pelo prazo: "Link expirado".
  if (outcome === 'EXPIRED') return 'convite-expirado';
  // Reservado por outro aparelho, consumido ou revogado (inclusive o
  // endereco de uma geracao anterior): "Este link nao esta mais disponivel".
  if (outcome === 'TAKEN' || outcome === 'CONSUMED' || outcome === 'REVOKED') {
    return 'convite-reservado';
  }
  // Recrutamento desligado ou link individual desativado.
  return 'convite-indisponivel';
}

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

  const origem = clickSource(request);
  // Robo de previa e pre-carregamento do navegador entram como
  // "Pre-visualizacao automatica": nenhum dos dois recebe numero de clique
  // humano.
  const preview = origem !== 'human';

  // O segredo da reserva so nasce para quem pode chegar ao formulario. Ele
  // identifica o aparelho e permite saber, ja no registro, se o link esta
  // reservado para OUTRA pessoa.
  const claim = origem === 'bot' ? null : readOrCreateClaim(request);

  // 1. Registro da abertura, antes de conferir disponibilidade. Token sem
  //    geracao conhecida nao gera linha nenhuma.
  const click = await recordInviteClick(request, token, claim?.hash ?? null, preview);

  // O robo de previa para por aqui: ele nunca recebe o contexto do convite,
  // nao reserva e nao dispara expiracao. O pre-carregamento do proprio
  // navegador segue o fluxo normal, senao a navegacao de verdade — que
  // reaproveita a resposta ja carregada — cairia numa tela vazia.
  if (origem === 'bot') {
    attachPublicState(response, 'convite-indisponivel');
    return response;
  }

  // 2. Agora sim, a disponibilidade.
  const context = await getInviteContext(token).catch(() => null);

  const finish = async (outcome: ClickOutcome, state: PublicState) => {
    if (click) await setInviteClickOutcome(click.clickId, outcome);
    attachPublicState(response, state);
    // O contexto do clique acompanha ate a tela de indisponibilidade: e de
    // la que vem a complementacao do aparelho.
    if (click) attachClickCookie(response, click.clickId);
    return response;
  };

  // Geracao conhecida mas ja encerrada — inclusive o endereco de uma geracao
  // anterior, que continua identificavel pelo registro imutavel da 021. O
  // desfecho que o banco calculou distingue expirado de indisponivel.
  if (click && click.outcome !== 'ALLOWED') {
    const { outcome } = click;
    if (outcome === 'EXPIRED') await expireDueInvites().catch(() => undefined);
    return finish(outcome, stateFor(outcome));
  }

  if (context?.finished) {
    await expireDueInvites().catch(() => undefined);
    return finish('EXPIRED', 'convite-expirado');
  }

  // Inexistente, revogado ou com o recrutamento desligado.
  if (!context || !context.accepts) {
    return finish('UNAVAILABLE', 'convite-indisponivel');
  }

  const { expiresAt } = context.client.invite;

  // Segredo da reserva do primeiro acesso: aqui ele apenas nasce. Quem
  // reserva de fato e a rota que carrega o formulario.
  if (claim?.isNew) attachClaimCookie(response, claim.secret, expiresAt);

  attachInviteContext(response, token, expiresAt);

  if (click) {
    await setInviteClickOutcome(click.clickId, 'ALLOWED');
    attachClickCookie(response, click.clickId);
  }

  return response;
}
