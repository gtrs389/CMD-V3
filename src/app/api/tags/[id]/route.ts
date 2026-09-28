import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { badRequest, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { apagarTag, editarTag } from '@/lib/server/tag.service';
import { normalizarTag } from '@/lib/domain/tags';
import { tagSchema } from '@/lib/validation/tag.schema';

/** Editar a tag muda o nome, o simbolo e a cor em todas as pessoas que a tem. */
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/tags/[id]'>) {
  try {
    const { id } = await ctx.params;
    await requirePermission('member.update');
    const corpo = normalizarTag(await readJson(request, tagSchema));
    if (!corpo.ok) throw badRequest(corpo.motivo);
    return jsonOk({ tag: await editarTag(id, corpo.tag) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Apaga a tag do catalogo e de todas as pessoas. As pessoas ficam intactas. */
export async function DELETE(_request: NextRequest, ctx: RouteContext<'/api/tags/[id]'>) {
  try {
    const { id } = await ctx.params;
    const user = await requirePermission('member.update');
    return jsonOk(await apagarTag(id, user));
  } catch (error) {
    return toErrorResponse(error);
  }
}
