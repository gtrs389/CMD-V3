import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { teamDuplicateSchema } from '@/lib/validation/server.schema';
import { duplicateTeam } from '@/lib/server/team-copy.service';

/**
 * Duplica um time (migration 049). EXCLUSIVO do ADMIN geral.
 *
 * Duas barreiras, como no Time DEMO: a permissao `client.create`, que nenhum
 * outro perfil tem, e o perfil ADMIN conferido aqui. Administrador do time e
 * integrante recebem 403.
 *
 * A copia leva administradores, Lideres, formularios e configuracoes; a
 * Equipe dos Lideres fica no oficial. O oficial e apenas LIDO — nenhuma
 * linha dele e escrita, e nenhuma linha da copia aponta para ele. A copia
 * fica fora da Visao geral e aparece em "Times" com o selo "Duplicado".
 */
export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/clients/[id]/duplicar'>,
) {
  try {
    const user = await requirePermission('client.create');
    if (user.role !== 'ADMIN') throw forbidden();

    const { id } = await ctx.params;
    const { name } = await readJson(request, teamDuplicateSchema);

    return jsonOk({ report: await duplicateTeam(id, { name }) }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
