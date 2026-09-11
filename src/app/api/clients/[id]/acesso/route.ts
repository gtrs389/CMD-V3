import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, toErrorResponse } from '@/lib/server/http';
import { getTeamAccessLink, rotateTeamAccessLink } from '@/lib/server/team-access.service';

/**
 * Link de acesso dos administradores do time.
 *
 * Exclusivo do ADMIN geral: o proprio administrador do time nao consulta,
 * nao copia e nao renova o link com que entra. `client.update` ja e uma
 * permissao so de ADMIN; o perfil e conferido de novo para o escopo nunca
 * depender apenas da matriz.
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
    return jsonOk({ accessLink: await getTeamAccessLink(id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Gera um endereco novo.
 *
 * O anterior para de funcionar na hora e todas as sessoes abertas dos
 * administradores daquele time caem junto.
 */
export async function POST(_request: NextRequest, ctx: RouteContext<'/api/clients/[id]/acesso'>) {
  try {
    const { id } = await ctx.params;
    await requireGeneralAdmin();
    return jsonOk({ accessLink: await rotateTeamAccessLink(id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
