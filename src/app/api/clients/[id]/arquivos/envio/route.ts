import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireClientAccess } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { prepararEnvio } from '@/lib/server/arquivos.service';

/**
 * Prepara o envio de um arquivo ao Repositorio de Arquivos: confere tipo,
 * tamanho e nome e devolve uma URL de envio assinada, de uso unico. O arquivo
 * vai direto do navegador para o armazenamento privado — nunca por aqui.
 */
const envioSchema = z.object({
  nome: z.string().min(1).max(500),
  tamanho: z.number().int().positive(),
  mime: z.string().max(200),
});

export async function POST(request: NextRequest, ctx: RouteContext<'/api/clients/[id]/arquivos/envio'>) {
  try {
    const { id } = await ctx.params;
    await requireClientAccess('files.manage', id);
    const arquivo = await readJson(request, envioSchema);
    return jsonOk({ envio: await prepararEnvio(id, arquivo) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
