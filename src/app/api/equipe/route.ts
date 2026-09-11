import { jsonOk, toErrorResponse } from '@/lib/server/http';
import { requireTeamSession } from '@/lib/server/guard';
import { getTeamOverview } from '@/lib/server/team.service';

/**
 * Dados da pagina "Minha mobilizacao".
 *
 * Exclusiva do perfil EQUIPE. A rota nao aceita nenhum parametro: o
 * integrante e a operacao saem da sessao, entao nao ha URL, `memberId`,
 * `clientId` ou filtro que amplie o que volta.
 */
export async function GET() {
  try {
    const session = await requireTeamSession();
    return jsonOk({ overview: await getTeamOverview(session) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
