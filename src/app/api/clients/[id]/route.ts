import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, notFound, readJson, toErrorResponse } from '@/lib/server/http';
import { clientUpdateSchema } from '@/lib/validation/server.schema';
import { deleteClient, getClient, updateClient } from '@/lib/server/client.service';

export async function GET(_request: NextRequest, ctx: RouteContext<'/api/clients/[id]'>) {
  try {
    await requirePermission('client.view');
    const { id } = await ctx.params;
    const client = await getClient(id);
    if (!client) throw notFound('Cliente não encontrado.');
    return jsonOk({ client });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/clients/[id]'>) {
  try {
    await requirePermission('client.update');
    const { id } = await ctx.params;
    const input = await readJson(request, clientUpdateSchema);
    return jsonOk({ client: await updateClient(id, input) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<'/api/clients/[id]'>) {
  try {
    await requirePermission('client.delete');
    const { id } = await ctx.params;
    // Integrantes, campos, respostas e convite saem junto pela cascata do banco.
    await deleteClient(id);
    return jsonOk({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
