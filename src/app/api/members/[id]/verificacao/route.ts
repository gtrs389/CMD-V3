import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireMemberAccess } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { getVerification, retryVerificationStep } from '@/lib/server/verification.service';

/**
 * Resultado da verificacao cadastral, somente para o ADMIN autenticado.
 *
 * Nenhuma rota publica devolve estes dados. A leitura fica registrada em
 * auditoria: quem abriu e quando, nunca o que foi visto.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/members/[id]/verificacao'>) {
  try {
    const { id } = await ctx.params;
    const user = await requireMemberAccess('verification.view', id);
    return jsonOk({ verification: await getVerification(id, user.id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const retrySchema = z.object({ step: z.enum(['cpf', 'tse']) });

/** Nova tentativa manual de uma etapa. Cada tentativa pode gerar cobranca. */
export async function POST(request: NextRequest, ctx: RouteContext<'/api/members/[id]/verificacao'>) {
  try {
    const { id } = await ctx.params;
    await requireMemberAccess('verification.retry', id);
    const { step } = await readJson(request, retrySchema);
    return jsonOk({ verification: await retryVerificationStep(id, step) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
