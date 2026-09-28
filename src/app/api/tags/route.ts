import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { badRequest, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { criarTag, listarTags } from '@/lib/server/tag.service';
import { normalizarTag } from '@/lib/domain/tags';
import { tagSchema } from '@/lib/validation/tag.schema';

/**
 * Catalogo de tags das pessoas do time (migration 048).
 *
 * Criar, editar, apagar e colocar tags e decisao do ADMIN geral, pela mesma
 * permissao de editar a ficha (`member.update`), que nenhum outro perfil tem.
 */
export async function GET() {
  try {
    await requirePermission('member.update');
    return jsonOk({ tags: await listarTags() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission('member.update');
    const corpo = normalizarTag(await readJson(request, tagSchema));
    if (!corpo.ok) throw badRequest(corpo.motivo);
    return jsonOk({ tag: await criarTag(corpo.tag, user) }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
