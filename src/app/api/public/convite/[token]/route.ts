import type { NextRequest } from 'next/server';
import { jsonOk, toErrorResponse } from '@/lib/server/http';
import { getClientByInviteToken } from '@/lib/server/client.service';

/**
 * Rota publica do convite.
 *
 * O token do link e validado aqui, no servidor: o banco guarda apenas o hash
 * SHA-256. Convite inexistente e convite desativado devolvem a mesma resposta
 * neutra, sem revelar nada sobre o cliente.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/public/convite/[token]'>) {
  try {
    const { token } = await ctx.params;
    const client = await getClientByInviteToken(token);

    if (!client || !client.invite.active) return jsonOk({ client: null });
    return jsonOk({ client });
  } catch (error) {
    return toErrorResponse(error);
  }
}
