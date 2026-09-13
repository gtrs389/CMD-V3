import type { NextRequest } from 'next/server';
import { gone, jsonGone, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { submitSurveyAnswer } from '@/lib/server/survey.service';
import { readClaim, SURVEY_CLAIM_COOKIE } from '@/lib/server/invite-claim';
import { readSurveyContext } from '@/lib/server/public-context';
import { surveyAnswerSchema } from '@/lib/validation/server.schema';

/**
 * Envio da resposta do questionario.
 *
 * O link e a reserva do aparelho vem dos cookies `HttpOnly`: o navegador nao
 * escolhe para qual time a resposta vai, nem de quem ela veio. O rotulo e o
 * tipo de cada pergunta sao copiados no servidor, a partir das perguntas
 * daquele time — o corpo da requisicao manda apenas o identificador da
 * pergunta e o valor.
 *
 * Quem responde NAO vira integrante: nenhuma linha e criada em
 * `cmd_members` ou `cmd_users`, e nenhuma credencial volta daqui. A tela
 * final mostra apenas o agradecimento.
 *
 * O link e de uso unico: a gravacao e o fechamento acontecem na mesma
 * transacao do banco, entao dois envios simultaneos nunca viram duas
 * respostas.
 */
export async function POST(request: NextRequest) {
  try {
    const token = readSurveyContext(request);
    if (!token) throw gone();

    const claim = readClaim(request, SURVEY_CLAIM_COOKIE);
    if (!claim) return jsonGone('taken');

    const input = await readJson(request, surveyAnswerSchema);
    const outcome = await submitSurveyAnswer(token, claim.hash, input);

    if (outcome === 'TAKEN') return jsonGone('taken');
    if (outcome === 'GONE') return jsonGone('expired');

    return jsonOk({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
