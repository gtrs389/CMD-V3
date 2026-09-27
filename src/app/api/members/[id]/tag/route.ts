import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireMemberAccess } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { setLeaderTag } from '@/lib/server/member.service';

/**
 * Tag do Lider (migration 048).
 *
 * Colocar, trocar ou tirar a tag e decisao do ADMIN geral: `member.update`
 * nao existe em nenhum outro perfil, e `requireMemberAccess` confere tambem
 * o alcance. O servidor recusa tag em quem e da Equipe — ela mostra a do
 * Lider dela.
 */

// Folga sobre o tamanho final: o servidor limpa espacos e corta no maximo.
const tagSchema = z.object({ tag: z.string().max(80).nullable() });

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/members/[id]/tag'>) {
  try {
    const { id } = await ctx.params;
    await requireMemberAccess('member.update', id);
    const { tag } = await readJson(request, tagSchema);

    return jsonOk({ member: await setLeaderTag(id, tag) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
