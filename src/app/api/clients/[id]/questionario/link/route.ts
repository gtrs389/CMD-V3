import type { NextRequest } from 'next/server';
import { requireClientAccess } from '@/lib/server/guard';
import { jsonOk, toErrorResponse } from '@/lib/server/http';
import { issueTeamSurveyLink } from '@/lib/server/survey.service';

/**
 * Gera o link do questionario DO TIME.
 *
 * O dono e o Administrador do time; quem clicou fica registrado como
 * gerador. O token volta uma unica vez, nesta resposta: o banco guarda
 * apenas o hash.
 *
 * Gerar um link novo revoga o anterior na hora, mesmo que ja tenha sido
 * enviado — e o mesmo comportamento do link de cadastro.
 */
export async function POST(
  _request: NextRequest,
  ctx: RouteContext<'/api/clients/[id]/questionario/link'>,
) {
  try {
    const { id } = await ctx.params;
    const user = await requireClientAccess('survey.send', id);
    const issued = await issueTeamSurveyLink(id, user.id);

    return jsonOk({
      token: issued.token,
      issuedAt: issued.issuedAt,
      expiresAt: issued.expiresAt,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
