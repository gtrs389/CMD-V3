import type { NextRequest } from 'next/server';
import { jsonGone, jsonOk, toErrorResponse } from '@/lib/server/http';
import { getInviteContext } from '@/lib/server/client.service';
import { claimInvite, expireDueInvites } from '@/lib/server/invite.service';
import { attachClaimCookie, readOrCreateClaim } from '@/lib/server/invite-claim';

/**
 * Rota publica do convite.
 *
 * O token do link e validado aqui, no servidor: o banco guarda apenas o hash
 * SHA-256. Convite inexistente, revogado ou com recrutamento desligado
 * devolve a mesma resposta neutra, sem revelar nada sobre o cliente.
 *
 * Duas regras obrigatorias acontecem neste GET:
 *
 *  1. Prazo. Link vencido responde 410, e o estado passa a EXPIRED no banco
 *     (sem cron: a expiracao e reconhecida na consulta).
 *  2. Uso unico. O primeiro navegador que abrir reserva o link; qualquer
 *     outro recebe 410. A reserva e um segredo aleatorio do servidor,
 *     enviado somente em cookie HttpOnly, e o banco guarda so o SHA-256.
 *
 * A resposta nunca carrega o segredo, o hash, o estado interno, a reserva,
 * horario tecnico ou qualquer configuracao do sistema.
 */
export async function GET(request: NextRequest, ctx: RouteContext<'/api/public/convite/[token]'>) {
  try {
    const { token } = await ctx.params;
    const context = await getInviteContext(token);

    // Vencido, consumido ou substituido: 410, sem detalhe nenhum. O estado
    // e atualizado aqui mesmo, na consulta: nao existe cron.
    if (context?.finished) {
      await expireDueInvites();
      return jsonGone('expired');
    }

    // Inexistente, revogado ou recrutamento desligado: resposta neutra.
    if (!context || !context.accepts) return jsonOk({ client: null, owner: null });

    const claim = readOrCreateClaim(request);
    const outcome = await claimInvite(token, claim.hash);

    // Outro navegador tentando abrir um link ja reservado.
    if (outcome === 'TAKEN') return jsonGone('taken');
    if (outcome === 'GONE') return jsonGone('expired');

    const response = jsonOk({ client: context.client, owner: context.publicOwner });

    // O cookie so e (re)gravado quando o navegador ainda nao tem a reserva.
    if (claim.isNew) {
      attachClaimCookie(response, token, claim.secret, context.client.invite.expiresAt);
    }

    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
