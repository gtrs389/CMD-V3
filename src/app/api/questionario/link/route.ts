import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, toErrorResponse } from '@/lib/server/http';
import { issueSurveyLink } from '@/lib/server/survey.service';

/**
 * Gera ou renova o PROPRIO link do questionario.
 *
 * O dono do link e sempre a sessao autenticada: nenhum identificador de
 * usuario, time ou duracao e lido do corpo da requisicao. O prazo e aplicado
 * no banco conforme o perfil do dono, com a MESMA configuracao do link de
 * cadastro — quem escolhe a duracao continua sendo so o ADMIN, em
 * Configuracoes.
 *
 * O banco recusa a geracao com o questionario desligado ou sem nenhuma
 * pergunta ativa: nao existe link para um questionario que nao pergunta
 * nada.
 */
export async function POST() {
  try {
    const user = await requirePermission('survey.send');
    if (!user.candidateId || (user.role !== 'CANDIDATE' && user.role !== 'EQUIPE')) {
      throw forbidden('Este perfil não tem link de questionário.');
    }

    const issued = await issueSurveyLink(user.id, user.id);

    return jsonOk({
      token: issued.token,
      issuedAt: issued.issuedAt,
      expiresAt: issued.expiresAt,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
