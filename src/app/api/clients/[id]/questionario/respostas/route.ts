import type { NextRequest } from 'next/server';
import { requireClientAccess } from '@/lib/server/guard';
import { jsonOk, toErrorResponse } from '@/lib/server/http';
import { listSurveyResponses } from '@/lib/server/survey.service';

/**
 * Respostas recebidas pelo questionario do time.
 *
 * ADMIN geral e Administrador do time veem todas as respostas daquele time.
 * O perfil EQUIPE nao chega aqui: `requireClientAccess` recusa — a area dele
 * e "Minha mobilizacao", e la ele ve somente as respostas dos proprios
 * links.
 *
 * Nada nesta resposta e integrante: sao pessoas que apenas responderam.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<'/api/clients/[id]/questionario/respostas'>,
) {
  try {
    const { id } = await ctx.params;
    await requireClientAccess('survey.view', id);
    return jsonOk({ responses: await listSurveyResponses({ clientId: id }) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
