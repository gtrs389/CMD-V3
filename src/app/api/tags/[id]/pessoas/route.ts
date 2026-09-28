import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { colocarTag, tirarTag } from '@/lib/server/tag.service';
import { pessoasDaTagSchema } from '@/lib/validation/tag.schema';

/**
 * Coloca ou tira uma tag de uma ou de varias pessoas de uma vez.
 *
 * `member.update` e exclusivo do ADMIN geral, que alcanca qualquer pessoa de
 * qualquer time — por isso nao ha recorte por time aqui.
 */
export async function POST(request: NextRequest, ctx: RouteContext<'/api/tags/[id]/pessoas'>) {
  try {
    const { id } = await ctx.params;
    const user = await requirePermission('member.update');
    const { acao, memberIds } = await readJson(request, pessoasDaTagSchema);
    return jsonOk(
      acao === 'colocar' ? await colocarTag(id, memberIds, user) : await tirarTag(id, memberIds, user),
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
