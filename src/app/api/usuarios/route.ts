import { requirePermission } from '@/lib/server/guard';
import { jsonOk, toErrorResponse } from '@/lib/server/http';
import {
  listMembersWithoutAccess,
  listSystemUsers,
  listTeamsWithoutAdmins,
} from '@/lib/server/user.service';

/**
 * Usuarios do sistema: ADMINs, administradores de time e integrantes da
 * equipe.
 *
 * Rota exclusiva do ADMIN. Nenhum hash de senha sai do servidor.
 *
 * Nao existe acao de gerar acesso aqui: o Administrador do time e o membro
 * da equipe entram por link do time + telefone, e o acesso deles nasce junto
 * do cadastro. Quem aparece sem acesso e apenas quem esta sem telefone ou com
 * telefone duplicado no time — corrigido o numero no cadastro, o acesso e
 * criado ou liberado sozinho.
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
