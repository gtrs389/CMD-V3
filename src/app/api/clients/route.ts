import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { clientCreateSchema } from '@/lib/validation/server.schema';
import { createClient, listClientSummaries } from '@/lib/server/client.service';
import { getTeamAccessLinks } from '@/lib/server/team-access.service';

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

    // Os dois enderecos de acesso nascem com o time e voltam aqui para o
    // ADMIN geral copiar: um para os Administradores do time, outro para a
    // equipe. Nenhum deles expira sozinho.
    const accessLinks = await getTeamAccessLinks(client.id);

    return jsonOk({ client, accessLinks }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
