import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { demoTeamCreateSchema } from '@/lib/validation/server.schema';
import { createDemoTeam } from '@/lib/server/demo.service';
import { getTeamAccessLinks } from '@/lib/server/team-access.service';
import { panelLink } from '@/lib/server/public-origin';
import { teamAccessPath } from '@/lib/utils/url';
import type { TeamAccessLinks } from '@/lib/types';

/**
 * Criacao de um Time DEMO. EXCLUSIVO do ADMIN geral.
 *
 * Duas barreiras: a permissao `client.create`, que nenhum outro perfil tem,
 * e o perfil ADMIN conferido aqui. Administrador do time e integrante
 * recebem 403 — esconder o botao na tela nunca foi protecao.
 *
 * A criacao e idempotente: `seedKey` e reservada no banco antes de qualquer
 * escrita, e repetir a requisicao devolve o time que a primeira criou, em
 * vez de criar outro. Qualquer falha no meio desfaz tudo.
 *
 * A resposta traz os dois enderecos de acesso do time, montados com o
 * endereco do PAINEL — os administradores do Time DEMO entram pelo MESMO
 * fluxo dos times reais: link do time + telefone.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission('client.create');
    if (user.role !== 'ADMIN') throw forbidden();

    const input = await readJson(request, demoTeamCreateSchema);
    const client = await createDemoTeam(input, { id: user.id });

    const links = await getTeamAccessLinks(client.id);
    const accessLinks = {
      TEAM_ADMIN: {
        ...links.TEAM_ADMIN,
        url: panelLink(request, teamAccessPath(links.TEAM_ADMIN.token)),
      },
      EQUIPE: {
        ...links.EQUIPE,
        url: panelLink(request, teamAccessPath(links.EQUIPE.token)),
      },
    } satisfies TeamAccessLinks;

    return jsonOk({ client, accessLinks }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
