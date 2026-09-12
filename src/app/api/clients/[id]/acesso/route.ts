import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, toErrorResponse } from '@/lib/server/http';
import { getTeamAccessLinks } from '@/lib/server/team-access.service';

/**
 * Enderecos de acesso do time: um para os Administradores, outro para a
 * equipe.
 *
 * Os dois enderecos nascem com o time e sao PERMANENTES: esta rota apenas os
 * devolve para o ADMIN geral copiar. Nao existe troca de endereco de acesso —
 * ela derrubaria todo mundo daquele publico de uma vez sem resolver nada.
 *
 * Exclusivo do ADMIN geral: nem o administrador do time nem o membro
 * consultam ou copiam o endereco com que entram. `client.update` ja e uma
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
    return jsonOk({ accessLinks: await getTeamAccessLinks(id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
