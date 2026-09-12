import type { NextRequest } from 'next/server';
import { jsonGone, jsonOk, toErrorResponse } from '@/lib/server/http';
import { getInviteContext } from '@/lib/server/client.service';
import { claimInvite, expireDueInvites } from '@/lib/server/invite.service';
import { recordInviteFirstAccess } from '@/lib/server/invite-access';
import { attachClaimCookie, readOrCreateClaim } from '@/lib/server/invite-claim';
import { readInviteContext } from '@/lib/server/public-context';

/**
 * Convite em andamento, resolvido pelo cookie.
 *
 * A rota nao recebe token nenhum: o codigo do link vive no cookie
 * `HttpOnly` gravado pela rota de entrada, entao nem a URL nem o corpo da
 * requisicao carregam identificador publico.
 *
 * E AQUI que o link e reservado para o primeiro aparelho, e nao mais na rota
 * de entrada. O motivo e simples: a rota de entrada e aberta tambem pelos
 * servidores do WhatsApp, do Telegram, do Facebook e dos verificadores de
 * e-mail para montar a previa do endereco, e nenhum deles guarda cookie —
 * reservar la fazia o primeiro robo ficar com o link e a pessoa convidada
 * receber "Link nao disponivel" sem ter aberto nada. Esta rota so e chamada
 * quando o formulario carrega de verdade em um navegador.
 *
 * A conferencia continua a mesma: prazo, estado e reserva do navegador, toda
 * decidida no servidor. O uso unico e a reserva pelo primeiro aparelho nao
 * mudam — a transicao ACTIVE -> CLAIMED continua atomica no banco, e
 * recarregar a pagina no mesmo aparelho nao cria evento novo.
 */
export async function GET(request: NextRequest) {
  try {
    const token = readInviteContext(request);
    if (!token) return jsonOk({ client: null, owner: null });

    const context = await getInviteContext(token);

    if (context?.finished) {
      await expireDueInvites();
      return jsonGone('expired');
    }
    if (!context || !context.accepts) return jsonOk({ client: null, owner: null });

    // O segredo normalmente ja veio da rota de entrada. Criar aqui cobre o
    // navegador que descartou o cookie do redirect — caso comum nos
    // navegadores embutidos dos aplicativos de mensagem.
    const claim = readOrCreateClaim(request);

    // `ACTIVE` antes da reserva significa que E ESTA chamada que esta
    // abrindo o link pela primeira vez.
    const primeiraVez = context.client.invite.state === 'ACTIVE';

    const outcome = await claimInvite(token, claim.hash);
    if (outcome === 'TAKEN') return jsonGone('taken');
    if (outcome === 'GONE') return jsonGone('expired');

    // Primeiro clique de verdade: o instante ja foi gravado pelo banco no
    // evento CLAIMED; aqui vao os sinais do aparelho de quem abriu. Como a
    // reserva saiu do redirect, o User-Agent registrado e o da PESSOA, nunca
    // o do robo de previa do aplicativo de mensagem. Recarregar a pagina nao
    // repete o registro.
    if (primeiraVez) await recordInviteFirstAccess(request, token);

    const response = jsonOk({ client: context.client, owner: context.publicOwner });
    if (claim.isNew) {
      attachClaimCookie(response, claim.secret, context.client.invite.expiresAt);
    }
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
