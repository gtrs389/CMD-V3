import type { NextRequest } from 'next/server';
import { badRequest, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { publicSubmissionSchema } from '@/lib/validation/server.schema';
import { getClientByInviteToken } from '@/lib/server/client.service';
import { createMember } from '@/lib/server/member.service';
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE,
  readOrCreateDeviceToken,
  recordMemberDevice,
} from '@/lib/server/device';

/**
 * Envio do formulario publico.
 *
 * Nao exige sessao, mas exige um token de convite ativo. O cliente vem sempre
 * do token: o corpo da requisicao nao escolhe para quem o cadastro vai.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/public/convite/[token]/membros'>,
) {
  try {
    const { token } = await ctx.params;
    const client = await getClientByInviteToken(token);
    if (!client || !client.invite.active) {
      throw badRequest('Este link nao esta ativo no momento.');
    }

    const input = await readJson(request, publicSubmissionSchema);

    // O aviso vigente vem do banco. Se ele exige aceite, o envio sem aceite e
    // recusado aqui, nao apenas na tela.
    const { privacy } = client.form;
    if (privacy.enabled && privacy.requireConsent && !input.consentAt) {
      throw badRequest('E necessario aceitar o aviso de privacidade para enviar o cadastro.');
    }

    const { device, ...submission } = input;
    const member = await createMember({ ...submission, clientId: client.id, source: 'invite' });

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

    // O navegador nao precisa de nada do cadastro de volta.
    const response = jsonOk({ ok: true, id: member.id }, 201);

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
