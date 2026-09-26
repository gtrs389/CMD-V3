import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, toErrorResponse } from '@/lib/server/http';
import { issuePersonalInvite } from '@/lib/server/invite.service';
import { publicLink } from '@/lib/server/public-origin';
import { invitePath } from '@/lib/utils/url';

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
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission('invite.renew');
    if (!user.candidateId || (user.role !== 'CANDIDATE' && user.role !== 'EQUIPE')) {
      throw forbidden('Este perfil não tem link pessoal.');
    }

    // Dono e gerador coincidem — menos quando quem esta no painel e o ADMIN
    // geral, em uma sessao de inspecao (migration 045): ali o dono continua
    // sendo a pessoa, e quem aparece como GERADOR e o ADMIN. O historico de
    // convites ja separa as duas coisas desde a migration 020, e e
    // exatamente para isto que a separacao existe.
    const issued = await issuePersonalInvite(user.id, user.impersonatedBy ?? user.id);

    // O token vai uma unica vez, para a propria pessoa copiar e compartilhar.
    // O endereco completo e montado AQUI, com o dominio publico: quem gera o
    // link esta no painel, e o painel nao e o endereco que se divulga.
    return jsonOk({
      token: issued.token,
      url: await publicLink(request, invitePath(issued.token)),
      issuedAt: issued.issuedAt,
      expiresAt: issued.expiresAt,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
