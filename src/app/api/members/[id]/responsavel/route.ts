import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireMemberAccess } from '@/lib/server/guard';
import { jsonOk, notFound, readJson, toErrorResponse } from '@/lib/server/http';
import { getMember, listRecruiters, transferMember } from '@/lib/server/member.service';

/**
 * Responsavel por um cadastro.
 *
 * Quem se cadastra por um link fica ligado ao dono daquele link, e esse
 * vinculo decide quem enxerga a pessoa, quem aparece em "Cadastrado por" e
 * de quem e o numero no ranking da equipe. Trocar isso e decisao do ADMIN
 * geral: `member.update` nao existe em nenhum outro perfil, e
 * `requireMemberAccess` confere tambem o alcance.
 *
 * O historico dos LINKS nao e tocado por nada aqui: em `cmd_invite_events`
 * continua registrado por qual link a pessoa entrou.
 */

/** Para quem este cadastro pode ser passado: o time dele, e so ele. */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/members/[id]/responsavel'>) {
  try {
    const { id } = await ctx.params;
    await requireMemberAccess('member.update', id);

    const member = await getMember(id);
    if (!member) throw notFound('Integrante não encontrado.');

    return jsonOk({ recruiters: await listRecruiters(member.clientId) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const transferSchema = z.object({ userId: z.string().min(1).max(64) });

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/members/[id]/responsavel'>) {
  try {
    const { id } = await ctx.params;
    const user = await requireMemberAccess('member.update', id);
    const { userId } = await readJson(request, transferSchema);

    return jsonOk({ member: await transferMember(id, userId, user.id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
