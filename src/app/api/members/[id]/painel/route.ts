import type { NextRequest } from 'next/server';
import { requireMemberAccess } from '@/lib/server/guard';
import { jsonOk, notFound, toErrorResponse } from '@/lib/server/http';
import { grantImpersonation } from '@/lib/server/impersonation.service';
import { getMember } from '@/lib/server/member.service';
import { panelLink } from '@/lib/server/public-origin';
import { prepararPainelDoIntegrante } from '@/lib/server/user.service';

/**
 * "Entrar no painel" a partir da FICHA do integrante.
 *
 * Diferente de `/api/usuarios/[id]/inspecionar`, que precisa de um usuario
 * pronto: aqui o ponto de partida e o cadastro. Quem ainda nao tinha acesso
 * — cadastro que nasceu sem ele, acesso desligado — ganha o acesso pelas
 * mesmas regras do cadastro, e so entao a visita e autorizada. Quando nao
 * da (celular incompleto ou de outra pessoa), a resposta diz o motivo.
 *
 * Exclusivo do ADMIN geral (`session.impersonate`), e a visita fica
 * registrada como qualquer outra.
 */
export async function POST(request: NextRequest, ctx: RouteContext<'/api/members/[id]/painel'>) {
  try {
    const { id } = await ctx.params;
    const admin = await requireMemberAccess('session.impersonate', id);

    const member = await getMember(id);
    if (!member) throw notFound('Integrante não encontrado.');

    const userId = await prepararPainelDoIntegrante(member);
    const grant = await grantImpersonation(admin, userId);

    return jsonOk({
      url: panelLink(request, `/inspecionar/${grant.token}`),
      name: grant.targetName,
      expiresAt: grant.expiresAt,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
