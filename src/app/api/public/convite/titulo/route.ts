import type { NextRequest } from 'next/server';
import { badRequest, jsonGone, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { getInviteContext } from '@/lib/server/client.service';
import { claimInvite, expireDueInvites } from '@/lib/server/invite.service';
import { readClaim } from '@/lib/server/invite-claim';
import { readInviteContext } from '@/lib/server/public-context';
import { lookupTseForInvite } from '@/lib/server/invite-verification.service';
import { inviteTseLookupSchema } from '@/lib/validation/server.schema';

/**
 * Confirmacao do titulo de eleitor, durante o preenchimento do link publico.
 *
 * A consulta nao usa o numero do titulo digitado: ela usa o CPF, o nome da
 * mae e a data de nascimento que a confirmacao do CPF ja devolveu, cifrados
 * no token recebido aqui. Sem um token de CPF valido — CPF nao confirmado,
 * consulta anterior sem sucesso ou token expirado — zona e secao ficam para
 * a pessoa preencher a mao, sem nenhuma cobranca e sem travar o cadastro.
 *
 * Time com a confirmacao de dados DESLIGADA (migration 041) tambem nao chega
 * ao fornecedor: zona e secao sao campos obrigatorios do formulario daquele
 * time, digitados pela propria pessoa.
 */
export async function POST(request: NextRequest) {
  try {
    const token = readInviteContext(request);
    if (!token) return jsonGone('taken');

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

    const { cpfToken } = await readJson(request, inviteTseLookupSchema);

    if (!context.client.verificationEnabled) {
      return jsonOk({ zona: null, secao: null, token: null });
    }

    const result = await lookupTseForInvite(cpfToken);

    return jsonOk(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
