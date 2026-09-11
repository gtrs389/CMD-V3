import { after } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireClientAccess, requirePermission } from '@/lib/server/guard';
import { badRequest, jsonOk, notFound, readJson, toErrorResponse } from '@/lib/server/http';
import { memberCreateSchema } from '@/lib/validation/server.schema';
import { createMember, listAllMembers } from '@/lib/server/member.service';
import { getClient } from '@/lib/server/client.service';
import { resolveLocation } from '@/lib/server/map-location.service';

export async function GET() {
  try {
    // Lista de todas as equipes: apenas o ADMIN enxerga mais de um candidato.
    await requirePermission('client.list');
    return jsonOk({ members: await listAllMembers() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Cadastro feito dentro do painel. O envio publico usa a rota do convite. */
export async function POST(request: NextRequest) {
  try {
    const input = await readJson(request, memberCreateSchema);
    await requireClientAccess('member.create', input.clientId);

    const client = await getClient(input.clientId);
    if (!client) throw notFound('Candidato não encontrado.');

    const { privacy } = client.form;
    if (privacy.enabled && privacy.requireConsent && !input.consentAt) {
      throw badRequest('E necessário registrar o aceite do aviso de privacidade.');
    }

    const member = await createMember({ ...input, source: 'admin' });

    // Coordenada da moradia depois da resposta: nunca segura o cadastro.
    after(() => resolveLocation(member.id, 'RESIDENCE').catch(() => undefined));

    return jsonOk({ member }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
