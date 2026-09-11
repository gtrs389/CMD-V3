import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { clientCreateSchema } from '@/lib/validation/server.schema';
import { createClient, listClientSummaries } from '@/lib/server/client.service';
import { createCandidateAccess, EMAIL_IN_USE } from '@/lib/server/user.service';

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

    // Acesso do time criado junto com o cadastro. A senha temporaria
    // volta uma unica vez, nesta resposta, e nao e gravada em lugar nenhum.
    const access = await createCandidateAccess({
      id: client.id,
      name: client.name,
      email: client.email,
    });

    return jsonOk(
      { client, access, accessMessage: access ? null : EMAIL_IN_USE },
      201,
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
