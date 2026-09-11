import type { NextRequest } from 'next/server';
import { completeFirstAccess } from '@/lib/server/auth.service';
import { requireSession } from '@/lib/server/guard';
import { firstAccessSchema } from '@/lib/validation/auth.schema';
import { SESSION_COOKIE } from '@/lib/auth/constants';
import { badRequest, jsonError, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';

/**
 * Troca obrigatoria da senha temporaria.
 *
 * O usuario vem da sessao, nunca do corpo. Ao final, a sessao atual e a unica
 * que continua valida: todas as outras sao revogadas no banco.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireSession();
    if (!user.mustChangePassword) throw badRequest('Esta conta já definiu a senha definitiva.');

    const input = await readJson(request, firstAccessSchema);
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const result = await completeFirstAccess(user.id, input.newPassword, token);

    if (!result.ok) {
      return jsonError(400, result.message ?? 'Não foi possível definir a senha.');
    }

    return jsonOk({ ok: true, candidateId: user.candidateId });
  } catch (error) {
    return toErrorResponse(error);
  }
}
