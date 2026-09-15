import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { clientCreateSchema } from '@/lib/validation/server.schema';
import { createClient, listClientSummaries } from '@/lib/server/client.service';
import { getTeamAccessLinks } from '@/lib/server/team-access.service';
import { panelLink } from '@/lib/server/public-origin';
import { teamAccessPath } from '@/lib/utils/url';
import type { TeamAccessLinks } from '@/lib/types';

/**
 * Listagem e criacao de clientes. Somente para sessao com permissao.
 *
 * `?demo=incluir` traz tambem os Times DEMO, e so a pagina "Times" do ADMIN
 * geral pede isso: e la que ele enxerga o time de demonstracao, com o selo,
 * para abrir e apresentar. Todo o resto do sistema — a comecar pelo painel,
 * que soma os numeros da operacao — recebe a lista sem DEMO.
 *
 * O parametro nao amplia permissao nenhuma: `client.list` ja e exclusivo do
 * ADMIN geral, e o perfil e conferido de novo aqui.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission('client.list');
    const includeDemo = request.nextUrl.searchParams.get('demo') === 'incluir'
      && user.role === 'ADMIN';

    return jsonOk({ clients: await listClientSummaries({ includeDemo }) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission('client.create');
    const input = await readJson(request, clientCreateSchema);
    const client = await createClient(input);

    // Os dois enderecos de acesso nascem com o time e voltam aqui para o
    // ADMIN geral copiar: um para os Administradores do time, outro para a
    // equipe. Nenhum deles expira sozinho.
    // O endereco completo e montado AQUI, com o endereco do PAINEL: e para
    // dentro do painel que este link leva. Montado no navegador, sairia com
    // o endereco da aba aberta — que pode ser o endereco exclusivo do ADMIN.
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
