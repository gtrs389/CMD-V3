import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, toErrorResponse } from '@/lib/server/http';
import { getSurvey, listSurveyResponses } from '@/lib/server/survey.service';

/**
 * Questionario do PROPRIO time, com as respostas que o perfil alcanca.
 *
 * A rota nao aceita parametro nenhum: o time sai da sessao. O recorte da
 * hierarquia tambem e decidido aqui, no servidor:
 *
 *   - Administrador do time ve todas as respostas do time;
 *   - EQUIPE ve somente as respostas que chegaram pelos PROPRIOS links.
 *
 * Nenhuma pessoa listada aqui e integrante: sao apenas respostas.
 */
export async function GET() {
  try {
    const user = await requirePermission('survey.view');
    if (!user.candidateId) throw forbidden('Este perfil não tem questionário.');

    const [survey, responses] = await Promise.all([
      getSurvey(user.candidateId),
      listSurveyResponses({
        clientId: user.candidateId,
        senderUserId: user.role === 'EQUIPE' ? user.id : null,
      }),
    ]);

    return jsonOk({ survey, responses });
  } catch (error) {
    return toErrorResponse(error);
  }
}
