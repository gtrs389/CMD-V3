import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import {
  grantAccess,
  grantPendingAccess,
  listCandidatesWithoutAccess,
  listSystemUsers,
} from '@/lib/server/user.service';

/**
 * Usuarios do sistema: ADMINs e candidatos com acesso.
 *
 * Rota exclusiva do ADMIN. Integrantes cadastrados pelos links publicos nao
 * aparecem aqui, e nenhum hash de senha sai do servidor.
 */
export async function GET() {
  try {
    const user = await requirePermission('settings.view');
    const [users, pendingCandidates] = await Promise.all([
      listSystemUsers(user.id),
      listCandidatesWithoutAccess(),
    ]);
    return jsonOk({ users, pendingCandidates });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const actionSchema = z.union([
  z.object({ action: z.literal('grant'), clientId: z.uuid('Candidato inválido.') }),
  z.object({ action: z.literal('grant-pending') }),
]);

/**
 * Gera acesso para um candidato ou para todos os que estao pendentes.
 *
 * As senhas temporarias voltam uma unica vez, nesta resposta. Nada e gravado
 * em log, arquivo ou URL: no banco fica apenas o hash scrypt.
 */
export async function POST(request: NextRequest) {
  try {
    await requirePermission('settings.manage');
    const input = await readJson(request, actionSchema);

    const outcome =
      input.action === 'grant' ? await grantAccess(input.clientId) : await grantPendingAccess();

    return jsonOk(outcome);
  } catch (error) {
    return toErrorResponse(error);
  }
}
