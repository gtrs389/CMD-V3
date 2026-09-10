import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { formUpdateSchema } from '@/lib/validation/server.schema';
import { updateClientForm } from '@/lib/server/client.service';

/** Construtor de formulario: campos, aviso de privacidade e textos. */
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/clients/[id]/form'>) {
  try {
    await requirePermission('form.manage');
    const { id } = await ctx.params;
    const input = await readJson(request, formUpdateSchema);
    return jsonOk({ client: await updateClientForm(id, input) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
