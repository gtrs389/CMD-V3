import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { TEAM_ACCESS_AUDIENCES } from '@/lib/types';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { getTeamAccessLinks, rotateTeamAccessLink } from '@/lib/server/team-access.service';

/**
 * Enderecos de acesso do time: um para os Administradores, outro para a
 * equipe.
 *
 * Exclusivo do ADMIN geral: nem o administrador do time nem o membro
 * consultam, copiam ou renovam o endereco com que entram. `client.update` ja
 * e uma permissao so de ADMIN; o perfil e conferido de novo para o escopo
 * nunca depender apenas da matriz.
 */
async function requireGeneralAdmin() {
  const user = await requirePermission('client.update');
  if (user.role !== 'ADMIN') throw forbidden();
  return user;
}

export async function GET(_request: NextRequest, ctx: RouteContext<'/api/clients/[id]/acesso'>) {
  try {
    const { id } = await ctx.params;
    await requireGeneralAdmin();
    return jsonOk({ accessLinks: await getTeamAccessLinks(id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const rotateSchema = z.object({ audience: z.enum(TEAM_ACCESS_AUDIENCES) });

/**
 * Gera um endereco novo para UM dos publicos.
 *
 * O anterior daquele publico para de funcionar na hora e as sessoes abertas
 * dele caem junto. O outro endereco do time nao e tocado, e os aparelhos
 * autorizados continuam valendo.
 */
export async function POST(request: NextRequest, ctx: RouteContext<'/api/clients/[id]/acesso'>) {
  try {
    const { id } = await ctx.params;
    await requireGeneralAdmin();
    const { audience } = await readJson(request, rotateSchema);
    return jsonOk({ accessLink: await rotateTeamAccessLink(id, audience) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
