import { after } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireMemberCreation, requirePermission } from '@/lib/server/guard';
import { badRequest, jsonOk, notFound, readJson, toErrorResponse } from '@/lib/server/http';
import { memberCreateSchema } from '@/lib/validation/server.schema';
import { createMember, listAllMembers, rollbackMember } from '@/lib/server/member.service';
import {
  createMemberAccess,
  teamPhoneTaken,
} from '@/lib/server/user.service';
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
    const user = await requireMemberCreation(input.clientId);

    const client = await getClient(input.clientId);
    if (!client) throw notFound('Time não encontrado.');

    const { privacy } = client.form;
    if (privacy.enabled && privacy.requireConsent && !input.consentAt) {
      throw badRequest('E necessário registrar o aceite do aviso de privacidade.');
    }

    // Telefone repetido no time NAO recusa mais a pessoa — em lugar nenhum.
    //
    // Ela entra como cadastro, e o que nao nasce e o ACESSO dela: o telefone
    // e a credencial do link do time, e dois donos para o mesmo numero
    // fariam a entrada dos DOIS ser recusada. A ficha ganha a etiqueta
    // "Conferir" (telefone repetido no time), e o quadro de inconsistencias
    // mostra o numero compartilhado. Era assim so na planilha; agora e a
    // regra: recusar a pessoa por causa do telefone de outra e perde-la.
    const semAcessoPorTelefoneRepetido = await teamPhoneTaken(client.id, input.phone);

    const member = await createMember(
      { ...input, source: 'admin' },
      { userId: user.id, name: user.name, role: user.role },
    );

    try {
      if (!semAcessoPorTelefoneRepetido) {
        await createMemberAccess({
          clientId: client.id,
          memberId: member.id,
          name: member.name,
          phone: member.phone,
        });
      }
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
