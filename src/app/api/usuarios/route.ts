import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import {
  grantMemberAccess,
  listMembersWithoutAccess,
  listSystemUsers,
  listTeamsWithoutAdmins,
} from '@/lib/server/user.service';

/**
 * Usuarios do sistema: ADMINs, administradores de time e integrantes da
 * equipe.
 *
 * Rota exclusiva do ADMIN. Nenhum hash de senha sai do servidor. Integrante
 * sem e-mail aparece como "E-mail necessário" e nao recebe senha nenhuma; o
 * administrador do time nunca tem senha, porque entra por link + telefone.
 */
export async function GET() {
  try {
    const user = await requirePermission('settings.view');
    const [users, teamsWithoutAdmins, pendingMembers] = await Promise.all([
      listSystemUsers(user.id),
      listTeamsWithoutAdmins(),
      listMembersWithoutAccess(),
    ]);
    return jsonOk({ users, teamsWithoutAdmins, pendingMembers });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const actionSchema = z.object({
  action: z.literal('grant-member'),
  memberId: z.uuid('Integrante inválido.'),
});

/**
 * Gera o acesso de um integrante.
 *
 * A senha temporaria volta uma unica vez, nesta resposta. Nada e gravado em
 * log, arquivo ou URL: no banco fica apenas o hash scrypt. O acesso do time
 * nao passa por aqui: ele e o link do time mais o telefone do administrador.
 */
export async function POST(request: NextRequest) {
  try {
    await requirePermission('settings.manage');
    const input = await readJson(request, actionSchema);
    return jsonOk(await grantMemberAccess(input.memberId));
  } catch (error) {
    return toErrorResponse(error);
  }
}
