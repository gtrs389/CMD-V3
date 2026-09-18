import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { submitSurveyAnswerFromPanel } from '@/lib/server/survey.service';
import { surveyAnswerSchema } from '@/lib/validation/server.schema';

/**
 * Resposta do Formulario 2 preenchida DENTRO do painel.
 *
 * E o mesmo formulario que o lider envia por link, so que preenchido por ele
 * com a pessoa na frente. Vale a mesma permissao de enviar o link
 * (`survey.send`): quem pode pedir a resposta pode anota-la.
 *
 * O time e o remetente saem da SESSAO. Nenhum identificador de time, de
 * usuario ou de remetente e lido do corpo da requisicao: trocar o payload
 * nao manda a resposta para outro time nem a atribui a outra pessoa.
 *
 * Quem responde NAO vira integrante, preenchido a mao ou pelo link: nenhuma
 * linha e criada em `cmd_members` ou `cmd_users`, e nenhuma credencial
 * existe aqui.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission('survey.send');
    if (!user.candidateId) throw forbidden('Este perfil não tem questionário.');

    const input = await readJson(request, surveyAnswerSchema);

    const { id } = await submitSurveyAnswerFromPanel(
      {
        clientId: user.candidateId,
        userId: user.id,
        name: user.name,
        role: user.role,
      },
      input,
    );

    return jsonOk({ ok: true, id }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
