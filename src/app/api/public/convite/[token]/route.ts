import type { NextRequest } from 'next/server';
import { jsonOk, toErrorResponse } from '@/lib/server/http';
import { getInviteContext } from '@/lib/server/client.service';

/**
 * Rota publica do convite.
 *
 * O token do link e validado aqui, no servidor: o banco guarda apenas o hash
 * SHA-256. Convite inexistente e convite desativado devolvem a mesma resposta
 * neutra, sem revelar nada sobre o cliente.
 *
 * Alem do formulario, a resposta traz quem enviou o convite: apenas nome,
 * foto e perfil. Identificador de usuario, de integrante e e-mail ficam no
 * servidor.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/public/convite/[token]'>) {
  try {
    const { token } = await ctx.params;
    const context = await getInviteContext(token);

    if (!context || !context.accepts) return jsonOk({ client: null, owner: null });
    return jsonOk({ client: context.client, owner: context.publicOwner });
  } catch (error) {
    return toErrorResponse(error);
  }
}
