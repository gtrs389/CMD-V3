import type { NextRequest } from 'next/server';
import { jsonGone, jsonOk, toErrorResponse } from '@/lib/server/http';
import { getInviteContext } from '@/lib/server/client.service';
import { claimInvite, expireDueInvites } from '@/lib/server/invite.service';
import { readClaim } from '@/lib/server/invite-claim';
import { readInviteContext } from '@/lib/server/public-context';

/**
 * Convite em andamento, resolvido pelo cookie.
 *
 * A rota nao recebe token nenhum: o codigo do link vive no cookie
 * `HttpOnly` gravado pela rota de entrada, entao nem a URL nem o corpo da
 * requisicao carregam identificador publico.
 *
 * A conferencia e a mesma de sempre: prazo, estado e reserva do navegador.
 * Sem contexto, sem reserva ou com o link encerrado, a resposta e a mesma
 * que a tela ja sabe tratar.
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

    // A reserva precisa continuar sendo deste navegador: o cookie do
    // contexto sozinho nao autoriza nada.
    const claim = readClaim(request);
    if (!claim) return jsonGone('taken');

    const outcome = await claimInvite(token, claim.hash);
    if (outcome === 'TAKEN') return jsonGone('taken');
    if (outcome === 'GONE') return jsonGone('expired');

    return jsonOk({ client: context.client, owner: context.publicOwner });
  } catch (error) {
    return toErrorResponse(error);
  }
}
