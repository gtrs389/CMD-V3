import type { NextRequest } from 'next/server';
import { requireClientAccess } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { getSurvey, updateSurvey } from '@/lib/server/survey.service';
import { surveyUpdateSchema } from '@/lib/validation/server.schema';

/**
 * Questionario do time.
 *
 * Leitura: ADMIN geral e Administrador do time. Montagem das perguntas:
 * SOMENTE o ADMIN geral — `survey.manage` nao existe em nenhum outro perfil,
 * e a conferencia acontece aqui, no servidor, nao so na tela.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/clients/[id]/questionario'>) {
  try {
    const { id } = await ctx.params;
    await requireClientAccess('survey.view', id);
    return jsonOk({ survey: await getSurvey(id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/clients/[id]/questionario'>) {
  try {
    const { id } = await ctx.params;
    await requireClientAccess('survey.manage', id);
    const input = await readJson(request, surveyUpdateSchema);
    return jsonOk({ survey: await updateSurvey(id, input) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
