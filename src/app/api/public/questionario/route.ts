import type { NextRequest } from 'next/server';
import { jsonGone, jsonOk, toErrorResponse } from '@/lib/server/http';
import { claimSurveyLink, resolveSurveyLink } from '@/lib/server/survey.service';
import { attachClaimCookie, readOrCreateClaim, SURVEY_CLAIM_COOKIE } from '@/lib/server/invite-claim';
import { readSurveyContext } from '@/lib/server/public-context';

/**
 * Questionario em andamento, resolvido pelo cookie.
 *
 * A rota nao recebe token nenhum: o codigo do link vive no cookie
 * `HttpOnly` gravado pela rota de entrada, entao nem a URL nem o corpo da
 * requisicao carregam identificador publico.
 *
 * E AQUI que o link e reservado para o primeiro aparelho — e nao na rota de
 * entrada, que tambem e aberta pelos robos de previa do WhatsApp, do
 * Telegram e dos verificadores de e-mail. Esta rota so e chamada quando o
 * formulario carrega de verdade em um navegador.
 *
 * O uso unico e conferido no banco, em transicao atomica: recarregar a
 * pagina no mesmo aparelho continua valendo, qualquer outro recebe 410.
 */
export async function GET(request: NextRequest) {
  try {
    const token = readSurveyContext(request);
    if (!token) return jsonOk({ survey: null });

    const estado = await resolveSurveyLink(token);
    if (estado.kind === 'gone') return jsonGone('expired');
    if (estado.kind === 'unavailable') return jsonOk({ survey: null });

    // O segredo da reserva tem cookie proprio: o mesmo navegador pode estar
    // com um link de cadastro aberto, e um nao pode derrubar o outro.
    const claim = readOrCreateClaim(request, SURVEY_CLAIM_COOKIE);

    const outcome = await claimSurveyLink(token, claim.hash);
    if (outcome === 'TAKEN') return jsonGone('taken');
    if (outcome === 'GONE') return jsonGone('expired');

    const response = jsonOk({ survey: estado.survey });
    if (claim.isNew) {
      attachClaimCookie(response, claim.secret, estado.expiresAt, SURVEY_CLAIM_COOKIE);
    }
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
