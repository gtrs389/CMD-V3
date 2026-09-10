import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { clientCreateSchema } from '@/lib/validation/server.schema';
import { createClient, listClientSummaries } from '@/lib/server/client.service';

/** Listagem e criacao de clientes. Somente para sessao com permissao. */
export async function GET() {
  try {
    await requirePermission('client.view');
    return jsonOk({ clients: await listClientSummaries() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission('client.create');
    const input = await readJson(request, clientCreateSchema);
    return jsonOk({ client: await createClient(input) }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
