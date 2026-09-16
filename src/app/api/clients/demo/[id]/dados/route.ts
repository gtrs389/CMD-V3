import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, toErrorResponse } from '@/lib/server/http';
import { refreshDemoTeam } from '@/lib/server/demo.service';

/**
 * Corrige os dados gerados de um Time DEMO que ja existe. EXCLUSIVO do ADMIN
 * geral.
 *
 * Duas barreiras, como na criacao: a permissao `client.create`, que nenhum
 * outro perfil tem, e o perfil ADMIN conferido aqui. Administrador do time e
 * integrante recebem 403.
 *
 * O que a rotina refaz e SOMENTE o que o gerador criou (as linhas marcadas
 * com `demo_seed`). O time, os administradores, os acessos deles, os links,
 * o formulario, o questionario, as configuracoes e qualquer pessoa cadastrada
 * a mao continuam exatamente como estao.
 *
 * Chamar duas vezes nao duplica nada: a geracao anterior sai antes de a nova
 * entrar, e a semente e a mesma.
 *
 * Time real nao passa daqui: `refreshDemoTeam` recusa o que nao e `is_demo`.
 */
export async function POST(
  _request: NextRequest,
  ctx: RouteContext<'/api/clients/demo/[id]/dados'>,
) {
  try {
    const user = await requirePermission('client.create');
    if (user.role !== 'ADMIN') throw forbidden();

    const { id } = await ctx.params;
    return jsonOk({ report: await refreshDemoTeam(id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
