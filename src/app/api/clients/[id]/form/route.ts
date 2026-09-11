import type { NextRequest } from 'next/server';
import { requireClientAccess } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { formUpdateSchema } from '@/lib/validation/server.schema';
import { updateClientForm } from '@/lib/server/client.service';

/** Construtor de formulario: campos, aviso de privacidade e textos. */
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
