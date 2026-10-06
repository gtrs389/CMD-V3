import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireClientAccess } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { excluirArquivo, renomearArquivo } from '@/lib/server/arquivos.service';

/** Renomear (PATCH) e excluir (DELETE) um arquivo do Repositorio do time. */
const renomeSchema = z.object({ nome: z.string().min(1).max(500) });

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/clients/[id]/arquivos/[arquivoId]'>) {
  try {
    const { id, arquivoId } = await ctx.params;
    await requireClientAccess('files.manage', id);
    const { nome } = await readJson(request, renomeSchema);
    return jsonOk({ arquivo: await renomearArquivo(id, arquivoId, nome) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<'/api/clients/[id]/arquivos/[arquivoId]'>) {
  try {
    const { id, arquivoId } = await ctx.params;
    await requireClientAccess('files.manage', id);
    await excluirArquivo(id, arquivoId);
    return jsonOk({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
