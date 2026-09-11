import type { NextRequest } from 'next/server';
import { requireClientAccess } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { formUpdateSchema } from '@/lib/validation/server.schema';
import { updateClientForm } from '@/lib/server/client.service';

/**
 * Construtor de formulario: campos, aviso de privacidade e textos.
 *
 * Area interna exclusiva do ADMIN. Sem `form.manage` a rota responde 403,
 * entao criar, editar, excluir, duplicar, ativar, desativar, mudar
 * obrigatoriedade, alterar opcoes ou reordenar pela mao (requisicao montada
 * no navegador, `curl`, etc.) nao passa daqui.
 */
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/clients/[id]/form'>) {
  try {
    const { id } = await ctx.params;
    await requireClientAccess('form.manage', id);
    const input = await readJson(request, formUpdateSchema);
    return jsonOk({ client: await updateClientForm(id, input) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
