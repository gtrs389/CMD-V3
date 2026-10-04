import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, toErrorResponse } from '@/lib/server/http';
import { votacaoNoMapa } from '@/lib/server/votacao.service';

/** Os votos de um candidato, escola por escola, zona e secao. */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/votacao/[id]'>) {
  try {
    await requirePermission('map.view');
    const { id } = await ctx.params;
    return jsonOk(await votacaoNoMapa(id));
  } catch (error) {
    return toErrorResponse(error);
  }
}
