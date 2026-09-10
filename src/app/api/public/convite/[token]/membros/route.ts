import type { NextRequest } from 'next/server';
import { badRequest, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { publicSubmissionSchema } from '@/lib/validation/server.schema';
import { getClientByInviteToken } from '@/lib/server/client.service';
import { createMember } from '@/lib/server/member.service';

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
    const member = await createMember({ ...input, clientId: client.id, source: 'invite' });

    // O navegador nao precisa de nada do cadastro de volta.
    return jsonOk({ ok: true, id: member.id }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
