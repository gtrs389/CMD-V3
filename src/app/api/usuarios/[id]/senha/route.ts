import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, toErrorResponse } from '@/lib/server/http';
import { assertNotSelf, resetPassword } from '@/lib/server/user.service';

/**
 * Nova senha temporaria.
 *
 * Todas as sessoes do usuario caem e o primeiro acesso volta a ser
 * obrigatorio. A senha aparece uma unica vez, nesta resposta.
 */
export async function POST(_request: NextRequest, ctx: RouteContext<'/api/usuarios/[id]/senha'>) {
  try {
    const current = await requirePermission('settings.manage');
    const { id } = await ctx.params;

    // A propria senha do ADMIN muda pelo menu de usuario, com a senha atual.
    assertNotSelf(current.id, id);

    return jsonOk({ credential: await resetPassword(id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
