import type { NextRequest } from 'next/server';
import { requireClientAccess } from '@/lib/server/guard';
import { jsonOk, notFound, readJson, toErrorResponse } from '@/lib/server/http';
import { clientUpdateSchema } from '@/lib/validation/server.schema';
import { deleteClient, getClient, updateClient } from '@/lib/server/client.service';

export async function GET(_request: NextRequest, ctx: RouteContext<'/api/clients/[id]'>) {
  try {
    const { id } = await ctx.params;
    await requireClientAccess('client.view', id);
    const client = await getClient(id);
    if (!client) throw notFound('Candidato não encontrado.');
    return jsonOk({ client });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/clients/[id]'>) {
  try {
    const { id } = await ctx.params;
    await requireClientAccess('client.update', id);
    const input = await readJson(request, clientUpdateSchema);
    return jsonOk({ client: await updateClient(id, input) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<'/api/clients/[id]'>) {
  try {
    const { id } = await ctx.params;
    await requireClientAccess('client.delete', id);
    // Integrantes, campos, respostas e convite saem junto pela cascata do banco.
    await deleteClient(id);
    return jsonOk({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
