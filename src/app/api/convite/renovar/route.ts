import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, toErrorResponse } from '@/lib/server/http';
import { issuePersonalInvite } from '@/lib/server/invite.service';

/**
 * Gera ou renova o PROPRIO link de recrutamento.
 *
 * O dono do link e sempre a sessao autenticada: nenhum identificador de
 * usuario, time ou duracao e lido do corpo da requisicao. Quem escolhe
 * a duracao e somente o ADMIN, em Configuracoes; aqui o prazo e aplicado no
 * banco conforme o PERFIL DO DONO.
 *
 * Gerar um link novo revoga o anterior na hora, mesmo que ja esteja
 * reservado por alguem.
 */
export async function POST() {
  try {
    const user = await requirePermission('invite.renew');
    if (!user.candidateId || (user.role !== 'CANDIDATE' && user.role !== 'EQUIPE')) {
      throw forbidden('Este perfil não tem link pessoal.');
    }

    const issued = await issuePersonalInvite(user.id);

    // O token vai uma unica vez, para a propria pessoa copiar e compartilhar.
    return jsonOk({
      token: issued.token,
      issuedAt: issued.issuedAt,
      expiresAt: issued.expiresAt,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
