import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { demoRecruitersSchema } from '@/lib/validation/server.schema';
import { countDemoRecruiters, setDemoRecruiters } from '@/lib/server/demo.service';

/**
 * Segunda camada de um Time DEMO. EXCLUSIVO do ADMIN geral.
 *
 * Define QUANTAS pessoas do time tambem recrutam. Recebe o total desejado, e
 * nao um passo: o ADMIN geral diz como o time deve ficar, e um numero menor
 * desfaz — os recrutadores que sobram somem e os cadastros deles voltam para
 * o administrador. Zero devolve o time a uma camada so.
 *
 * Rota propria, e nao um campo em "editar time", pelo mesmo motivo da chave
 * de acesso: `client.update` tambem pertence ao Administrador do TIME, e
 * isto aqui e do ADMIN geral. As duas barreiras sao as mesmas da criacao — a
 * permissao `client.create`, que nenhum outro perfil tem, e o perfil ADMIN
 * conferido de novo.
 */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/clients/demo/[id]/recrutadores'>,
) {
  try {
    const user = await requirePermission('client.create');
    if (user.role !== 'ADMIN') throw forbidden();

    const { id } = await ctx.params;
    const { recruiters } = await readJson(request, demoRecruitersSchema);

    return jsonOk(await setDemoRecruiters(id, recruiters));
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Quantas pessoas recrutam hoje: e o valor que a tela abre preenchido. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<'/api/clients/demo/[id]/recrutadores'>,
) {
  try {
    const user = await requirePermission('client.create');
    if (user.role !== 'ADMIN') throw forbidden();

    const { id } = await ctx.params;
    return jsonOk({ recruiters: await countDemoRecruiters(id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
