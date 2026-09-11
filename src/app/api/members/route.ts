import { after } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireClientAccess, requirePermission } from '@/lib/server/guard';
import { badRequest, jsonOk, notFound, readJson, toErrorResponse } from '@/lib/server/http';
import { memberCreateSchema } from '@/lib/validation/server.schema';
import { createMember, listAllMembers, rollbackMember } from '@/lib/server/member.service';
import { assertTeamPhoneAvailable, createMemberAccess } from '@/lib/server/user.service';
import { getClient } from '@/lib/server/client.service';
import { resolveLocation } from '@/lib/server/map-location.service';

export async function GET() {
  try {
    // Lista de todas as equipes: apenas o ADMIN enxerga mais de um time.
    await requirePermission('client.list');
    return jsonOk({ members: await listAllMembers() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Cadastro feito dentro do painel. O envio publico usa a rota do convite.
 *
 * O responsavel pelo cadastro e a sessao autenticada, nunca um valor do
 * corpo da requisicao. O integrante nasce com acesso proprio, sem e-mail e
 * sem senha: ele entra pelo link do time com o telefone deste cadastro.
 */
export async function POST(request: NextRequest) {
  try {
    const input = await readJson(request, memberCreateSchema);
    const user = await requireClientAccess('member.create', input.clientId);

    const client = await getClient(input.clientId);
    if (!client) throw notFound('Time não encontrado.');

    const { privacy } = client.form;
    if (privacy.enabled && privacy.requireConsent && !input.consentAt) {
      throw badRequest('E necessário registrar o aceite do aviso de privacidade.');
    }

    // Telefone repetido no time interrompe antes de gravar: nada orfao e
    // criado, e o numero continua identificando uma unica pessoa.
    await assertTeamPhoneAvailable(client.id, input.phone);

    const member = await createMember(
      { ...input, source: 'admin' },
      { userId: user.id, name: user.name, role: user.role },
    );

    try {
      await createMemberAccess({
        clientId: client.id,
        memberId: member.id,
        name: member.name,
        phone: member.phone,
      });
    } catch (error) {
      await rollbackMember(member.id);
      throw error;
    }

    // Coordenada da moradia depois da resposta: nunca segura o cadastro.
    after(() => resolveLocation(member.id, 'RESIDENCE').catch(() => undefined));

    return jsonOk({ member }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
