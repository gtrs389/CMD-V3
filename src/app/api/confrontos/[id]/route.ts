import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { atualizarNaSala, tirarDaSala } from '@/lib/server/confronto.service';
import { candidatoSchema, lideresSchema, resumoSchema } from '../schema';

const mudancaSchema = z.object({
  esquerda: z.array(candidatoSchema).min(1).max(30).optional(),
  direita: z.array(candidatoSchema).max(30).optional(),
  lideres: lideresSchema.optional(),
  resumo: resumoSchema.optional(),
});

/** Os adversarios chamados, os Lideres selecionados ou o placar da ultima leitura. */
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/confrontos/[id]'>) {
  try {
    const { id } = await ctx.params;
    const user = await requirePermission('map.view');
    const mudanca = await readJson(request, mudancaSchema);
    return jsonOk({ escola: await atualizarNaSala(user, id, mudanca) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Tira a escola da sala. */
export async function DELETE(_request: NextRequest, ctx: RouteContext<'/api/confrontos/[id]'>) {
  try {
    const { id } = await ctx.params;
    const user = await requirePermission('map.view');
    await tirarDaSala(user, id);
    return jsonOk({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
