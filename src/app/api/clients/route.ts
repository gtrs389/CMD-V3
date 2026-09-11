import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { clientCreateSchema } from '@/lib/validation/server.schema';
import { createClient, listClientSummaries } from '@/lib/server/client.service';
import { getTeamAccessLink } from '@/lib/server/team-access.service';

/** Listagem e criacao de clientes. Somente para sessao com permissao. */
export async function GET() {
  try {
    await requirePermission('client.list');
    return jsonOk({ clients: await listClientSummaries() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission('client.create');
    const input = await readJson(request, clientCreateSchema);
    const client = await createClient(input);

    // O link de acesso dos administradores nasce com o time e volta aqui
    // para o ADMIN geral copiar. Ele nunca expira sozinho e vale para todos
    // os administradores ativos daquele time.
    const accessLink = await getTeamAccessLink(client.id);

    return jsonOk({ client, accessLink }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
