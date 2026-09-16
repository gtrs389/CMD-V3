import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { demoAccessSchema } from '@/lib/validation/server.schema';
import { setDemoAccess } from '@/lib/server/demo.service';

/**
 * Liga e desliga o acesso de um Time DEMO. EXCLUSIVO do ADMIN geral.
 *
 * A rota e propria, e nao um campo em "editar time", por um motivo de
 * seguranca: `client.update` tambem pertence ao Administrador do TIME. Se a
 * chave viajasse por ali, o administrador do Time DEMO religaria o proprio
 * acesso depois de o ADMIN geral te-lo desligado.
 *
 * Aqui sao as mesmas duas barreiras da criacao: a permissao `client.create`,
 * que nenhum outro perfil tem, e o perfil ADMIN conferido de novo.
 */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/clients/demo/[id]/acesso'>,
) {
  try {
    const user = await requirePermission('client.create');
    if (user.role !== 'ADMIN') throw forbidden();

    const { id } = await ctx.params;
    const { enabled } = await readJson(request, demoAccessSchema);

    return jsonOk({ client: await setDemoAccess(id, enabled) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
