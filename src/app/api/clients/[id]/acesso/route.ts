import type { NextRequest } from 'next/server';
import type { TeamAccessLink, TeamAccessAudience } from '@/lib/types';
import { canReachClient } from '@/lib/permissions';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, toErrorResponse } from '@/lib/server/http';
import { getTeamAccessLink, getTeamAccessLinks } from '@/lib/server/team-access.service';
import { publicLink } from '@/lib/server/public-origin';
import { teamAccessPath } from '@/lib/utils/url';

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

/**
 * Acrescenta o endereco completo, com o DOMINIO PUBLICO.
 *
 * Quem copia o link esta no painel, e o painel nao e o endereco que se
 * divulga: montado no navegador, o link sairia apontando para o painel — ou
 * para o endereco exclusivo do ADMIN, que nao pode circular por WhatsApp.
 */
async function comUrl(request: NextRequest, links: Visiveis): Promise<Visiveis> {
  const entradas = await Promise.all(
    Object.entries(links).map(async ([audience, link]) => [
      audience,
      { ...link, url: await publicLink(request, teamAccessPath(link.token)) },
    ]),
  );
  return Object.fromEntries(entradas) as Visiveis;
}

export async function GET(request: NextRequest, ctx: RouteContext<'/api/clients/[id]/acesso'>) {
  try {
    const { id } = await ctx.params;
    const user = await requirePermission('invite.view');

    if (user.role === 'ADMIN') {
      const accessLinks = await comUrl(request, await getTeamAccessLinks(id));
      return jsonOk({ accessLinks });
    }

    // Administrador do proprio time: so o endereco da equipe.
    if (user.role === 'CANDIDATE' && canReachClient(user, id)) {
      const accessLinks = await comUrl(request, {
        EQUIPE: await getTeamAccessLink(id, 'EQUIPE'),
      });
      return jsonOk({ accessLinks });
    }

    throw forbidden();
  } catch (error) {
    return toErrorResponse(error);
  }
}
