import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import {
  grantAccess,
  grantMemberAccess,
  grantPendingAccess,
  listCandidatesWithoutAccess,
  listMembersWithoutAccess,
  listSystemUsers,
} from '@/lib/server/user.service';

/**
 * Usuarios do sistema: ADMINs, candidatos e integrantes da equipe.
 *
 * Rota exclusiva do ADMIN. Nenhum hash de senha sai do servidor. Integrante
 * sem e-mail aparece como "E-mail necessário" e nao recebe senha nenhuma.
 */
export async function GET() {
  try {
    const user = await requirePermission('settings.view');
    const [users, pendingCandidates, pendingMembers] = await Promise.all([
      listSystemUsers(user.id),
      listCandidatesWithoutAccess(),
      listMembersWithoutAccess(),
    ]);
    return jsonOk({ users, pendingCandidates, pendingMembers });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const actionSchema = z.union([
  z.object({ action: z.literal('grant'), clientId: z.uuid('Candidato inválido.') }),
  z.object({ action: z.literal('grant-member'), memberId: z.uuid('Integrante inválido.') }),
  z.object({ action: z.literal('grant-pending') }),
]);

/**
 * Gera acesso para um candidato, para um integrante ou para todos os
 * candidatos pendentes.
 *
 * As senhas temporarias voltam uma unica vez, nesta resposta. Nada e gravado
 * em log, arquivo ou URL: no banco fica apenas o hash scrypt.
 */
export async function POST(request: NextRequest) {
  try {
    await requirePermission('settings.manage');
    const input = await readJson(request, actionSchema);

    if (input.action === 'grant') return jsonOk(await grantAccess(input.clientId));
    if (input.action === 'grant-member') return jsonOk(await grantMemberAccess(input.memberId));
    return jsonOk(await grantPendingAccess());
  } catch (error) {
    return toErrorResponse(error);
  }
}
