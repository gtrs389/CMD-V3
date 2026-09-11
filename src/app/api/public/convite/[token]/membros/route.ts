import { after } from 'next/server';
import type { NextRequest } from 'next/server';
import { badRequest, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { publicSubmissionSchema } from '@/lib/validation/server.schema';
import { getInviteContext } from '@/lib/server/client.service';
import { createMember, rollbackMember } from '@/lib/server/member.service';
import { assertMemberEmailFree, createTeamAccess } from '@/lib/server/user.service';
import {
  createPendingVerification,
  recordConfirmation,
  runVerification,
} from '@/lib/server/verification.service';
import {
  createPendingLocation,
  resolveLocation,
} from '@/lib/server/map-location.service';
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE,
  readOrCreateDeviceToken,
  recordMemberDevice,
} from '@/lib/server/device';

/**
 * Envio do formulario publico.
 *
 * Nao exige sessao, mas exige um link ativo. A operacao E o responsavel pelo
 * cadastro vem sempre do token: nenhum `recruiterUserId`, `clientId` ou
 * campo equivalente do corpo da requisicao e considerado. Forjar o
 * responsavel no payload nao muda nada, porque o valor nem e lido.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/public/convite/[token]/membros'>,
) {
  try {
    const { token } = await ctx.params;
    const context = await getInviteContext(token);
    if (!context || !context.accepts) {
      throw badRequest('Este link não está ativo no momento.');
    }

    const { client, owner } = context;
    const input = await readJson(request, publicSubmissionSchema);

    // O aviso vigente vem do banco. Se ele exige aceite, o envio sem aceite e
    // recusado aqui, nao apenas na tela.
    const { privacy } = client.form;
    if (privacy.enabled && privacy.requireConsent && !input.consentAt) {
      throw badRequest('E necessário aceitar o aviso de privacidade para enviar o cadastro.');
    }

    // Conferencia do e-mail ANTES de gravar qualquer coisa: e-mail repetido
    // interrompe o cadastro sem deixar integrante, usuario ou link orfao.
    await assertMemberEmailFree(input.email);

    const { device, ...submission } = input;
    const member = await createMember(
      { ...submission, clientId: client.id, source: 'invite' },
      // Responsavel determinado no servidor, pelo dono do link utilizado.
      owner ? { userId: owner.userId, name: owner.name, role: owner.role } : null,
    );

    // Acesso do integrante: usuario EQUIPE e link pessoal, criados juntos.
    // Se falhar, o integrante recem-criado e desfeito: nada pela metade.
    let access;
    try {
      access = await createTeamAccess({
        clientId: client.id,
        memberId: member.id,
        name: member.name,
        email: input.email,
      });
    } catch (error) {
      await rollbackMember(member.id);
      throw error;
    }

    // Prova da confirmacao final e verificacao pendente. Nenhum dos dois pode
    // impedir o cadastro, que ja esta salvo.
    await recordConfirmation(client.id, member.id).catch(() => undefined);
    await createPendingVerification(client.id, member.id).catch(() => undefined);

    // As consultas acontecem depois da resposta, no servidor. A tela de
    // sucesso nao espera pelo fornecedor e nunca recebe nada delas.
    // A moradia aproximada nao espera pela consulta eleitoral.
    await createPendingLocation(client.id, member.id, 'RESIDENCE').catch(() => undefined);

    after(async () => {
      await resolveLocation(member.id, 'RESIDENCE').catch(() => undefined);
      await runVerification(member.id).catch(() => undefined);
    });

    // Sinal de seguranca, gravado depois do cadastro: nunca o impede.
    // O token vive so no cookie; o banco guarda apenas o hash dele.
    const deviceCookie = readOrCreateDeviceToken(request);
    await recordMemberDevice({
      request,
      clientId: client.id,
      memberId: member.id,
      token: deviceCookie.token,
      signals: device,
    });

    // A senha temporaria existe apenas nesta resposta e no estado da tela de
    // sucesso: nao vai para log, URL, banco em texto puro nem armazenamento
    // do navegador.
    const response = jsonOk(
      { ok: true, id: member.id, access: { email: access.email, password: access.password } },
      201,
    );

    if (deviceCookie.isNew) {
      response.cookies.set({
        name: DEVICE_COOKIE,
        value: deviceCookie.token,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: DEVICE_COOKIE_MAX_AGE,
      });
    }

    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
