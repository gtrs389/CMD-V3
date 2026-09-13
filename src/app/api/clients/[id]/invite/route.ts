import type { NextRequest } from 'next/server';
import { requireClientAccess } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { inviteActiveSchema } from '@/lib/validation/server.schema';
import { regenerateInvite, setInviteActive } from '@/lib/server/client.service';
import { publicLink } from '@/lib/server/public-origin';
import { invitePath } from '@/lib/utils/url';

/** Ativa ou desativa o link publico. */
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/clients/[id]/invite'>) {
  try {
    const { id } = await ctx.params;
    await requireClientAccess('invite.manage', id);
    const { active } = await readJson(request, inviteActiveSchema);
    return jsonOk({ client: await setInviteActive(id, active) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Gera um novo token. O valor original volta uma unica vez, nesta resposta:
 * o banco guarda apenas o hash SHA-256.
 *
 * Quem clica fica registrado como gerador no historico; o dono do link
 * continua sendo o Administrador do time.
 */
export async function POST(request: NextRequest, ctx: RouteContext<'/api/clients/[id]/invite'>) {
  try {
    const { id } = await ctx.params;
    const user = await requireClientAccess('invite.manage', id);
    const client = await regenerateInvite(id, user.id);

    // O endereco completo sai daqui, com o dominio publico: quem gera o link
    // esta no painel, e o painel nao e o endereco que se divulga.
    const url = client.invite.token
      ? await publicLink(request, invitePath(client.invite.token))
      : null;

    return jsonOk({ client, url });
  } catch (error) {
    return toErrorResponse(error);
  }
}
