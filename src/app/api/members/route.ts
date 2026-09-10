import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, notFound, readJson, toErrorResponse } from '@/lib/server/http';
import { memberCreateSchema } from '@/lib/validation/server.schema';
import { createMember, listAllMembers } from '@/lib/server/member.service';
import { getClient } from '@/lib/server/client.service';

export async function GET() {
  try {
    await requirePermission('member.view');
    return jsonOk({ members: await listAllMembers() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Cadastro feito dentro do painel. O envio publico usa a rota do convite. */
export async function POST(request: NextRequest) {
  try {
    await requirePermission('member.create');
    const input = await readJson(request, memberCreateSchema);

    const client = await getClient(input.clientId);
    if (!client) throw notFound('Cliente nao encontrado.');

    return jsonOk({ member: await createMember({ ...input, source: 'admin' }) }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
