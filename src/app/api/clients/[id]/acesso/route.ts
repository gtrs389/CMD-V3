import type { NextRequest } from 'next/server';
import type { TeamAccessLink, TeamAccessAudience } from '@/lib/types';
import { canReachClient } from '@/lib/permissions';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, toErrorResponse } from '@/lib/server/http';
import { getTeamAccessLink, getTeamAccessLinks } from '@/lib/server/team-access.service';

/**
 * Enderecos de acesso do time: um para os Administradores, outro para a
 * equipe.
 *
 * Os dois enderecos nascem com o time e sao PERMANENTES: esta rota apenas os
 * devolve para quem pode distribui-los. Nao existe troca de endereco de
 * acesso — ela derrubaria todo mundo daquele publico de uma vez sem resolver
 * nada.
 *
 * Quem ve o que:
 *
 *   ADMIN geral            os dois enderecos, de qualquer time.
 *   Administrador do time  somente o endereco da EQUIPE, e somente do
 *                          PROPRIO time: e ele quem convida os membros para
 *                          o painel. O endereco dos administradores fica de
 *                          fora — distribuir acesso de administracao e
 *                          decisao do ADMIN geral.
 *   Equipe e publico       nada: 403.
 *
 * O recorte e feito aqui, no servidor. Trocar o identificador na URL nao
 * amplia nada, porque o escopo da sessao e comparado com o time pedido.
 */
type Visiveis = Partial<Record<TeamAccessAudience, TeamAccessLink>>;

export async function GET(_request: NextRequest, ctx: RouteContext<'/api/clients/[id]/acesso'>) {
  try {
    const { id } = await ctx.params;
    const user = await requirePermission('invite.view');

    if (user.role === 'ADMIN') {
      const accessLinks: Visiveis = await getTeamAccessLinks(id);
      return jsonOk({ accessLinks });
    }

    // Administrador do proprio time: so o endereco da equipe.
    if (user.role === 'CANDIDATE' && canReachClient(user, id)) {
      const accessLinks: Visiveis = { EQUIPE: await getTeamAccessLink(id, 'EQUIPE') };
      return jsonOk({ accessLinks });
    }

    throw forbidden();
  } catch (error) {
    return toErrorResponse(error);
  }
}
