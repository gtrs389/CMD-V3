import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireClientAccess } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { confirmarEnvio, listarArquivos } from '@/lib/server/arquivos.service';

/**
 * Repositorio de Arquivos do time (migration 059).
 *
 * GET:  os arquivos do time, com URLs de leitura assinadas e curtas.
 * POST: confirma um envio feito pela URL assinada (`./envio`): o servidor
 *       confere no armazenamento que o arquivo chegou e so entao o registra.
 *
 * ADMIN alcanca qualquer time; o Administrador do time, so o proprio.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/clients/[id]/arquivos'>) {
  try {
    const { id } = await ctx.params;
    await requireClientAccess('files.view', id);
    return jsonOk({ arquivos: await listarArquivos(id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const confirmacaoSchema = z.object({
  caminho: z.string().min(5).max(500),
  nome: z.string().min(1).max(500),
  mime: z.string().max(200),
});

export async function POST(request: NextRequest, ctx: RouteContext<'/api/clients/[id]/arquivos'>) {
  try {
    const { id } = await ctx.params;
    const user = await requireClientAccess('files.manage', id);
    const entrada = await readJson(request, confirmacaoSchema);
    return jsonOk({ arquivo: await confirmarEnvio(id, entrada, user) }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
