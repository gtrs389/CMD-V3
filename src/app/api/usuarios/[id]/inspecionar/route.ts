import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, toErrorResponse } from '@/lib/server/http';
import { grantImpersonation } from '@/lib/server/impersonation.service';
import { panelLink } from '@/lib/server/public-origin';

/**
 * Autorizacao para o ADMIN geral entrar no painel de uma pessoa do time.
 *
 * Nao abre sessao nenhuma: devolve um endereco de uso unico, valido por
 * poucos minutos, que e trocado por sessao no PAINEL — e o painel da equipe
 * e do Administrador do time e `painel.`, nunca o endereco exclusivo do
 * ADMIN. Montar esse endereco no navegador apontaria para a aba aberta, que
 * e justamente o endereco errado.
 *
 * A visita inteira fica registrada em `cmd_impersonations`.
 */
export async function POST(
  _request: NextRequest,
  ctx: RouteContext<'/api/usuarios/[id]/inspecionar'>,
) {
  try {
    const { id } = await ctx.params;
    const admin = await requirePermission('session.impersonate');

    const grant = await grantImpersonation(admin, id);

    return jsonOk({
      url: panelLink(_request, `/inspecionar/${grant.token}`),
      name: grant.targetName,
      expiresAt: grant.expiresAt,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
