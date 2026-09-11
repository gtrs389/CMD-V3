import type { NextRequest } from 'next/server';
import { badRequest, jsonGone, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { getInviteContext } from '@/lib/server/client.service';
import { claimInvite, expireDueInvites } from '@/lib/server/invite.service';
import { readClaim } from '@/lib/server/invite-claim';
import { lookupCpfForInvite } from '@/lib/server/invite-verification.service';
import { inviteCpfLookupSchema } from '@/lib/validation/server.schema';

/**
 * Confirmacao do CPF, durante o preenchimento do link publico.
 *
 * So o navegador que reservou o link pode pedir esta consulta: o cookie da
 * reserva e conferido do mesmo jeito que no envio final, mas nada aqui muda
 * o estado do link nem o consome. Falha do fornecedor nunca aparece para
 * quem preenche: a resposta apenas deixa de trazer nome e token, e o
 * cadastro segue normal.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/public/convite/[token]/cpf'>,
) {
  try {
    const { token } = await ctx.params;
    const context = await getInviteContext(token);

    if (context?.finished) {
      await expireDueInvites();
      return jsonGone('expired');
    }
    if (!context || !context.accepts) {
      throw badRequest('Este link não está ativo no momento.');
    }

    const claim = readClaim(request);
    if (!claim) return jsonGone('taken');

    const outcome = await claimInvite(token, claim.hash);
    if (outcome === 'TAKEN') return jsonGone('taken');
    if (outcome === 'GONE') return jsonGone('expired');

    const { cpf } = await readJson(request, inviteCpfLookupSchema);
    const result = await lookupCpfForInvite(cpf);

    return jsonOk(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
