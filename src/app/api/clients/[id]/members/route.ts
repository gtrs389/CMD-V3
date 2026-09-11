import type { NextRequest } from 'next/server';
import { requireClientAccess } from '@/lib/server/guard';
import { jsonOk, toErrorResponse } from '@/lib/server/http';
import { listMembersForUser } from '@/lib/server/member.service';

/**
 * Equipe de um candidato.
 *
 * ADMIN e o proprio candidato veem a operacao inteira, em todos os niveis.
 * O perfil EQUIPE nao chega aqui: a area dele e "Minha mobilizacao", que so
 * devolve os recrutados diretos.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/clients/[id]/members'>) {
  try {
    const { id } = await ctx.params;
    const user = await requireClientAccess('member.view', id);
    return jsonOk({ members: await listMembersForUser(user, id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
