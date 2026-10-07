import type { NextRequest } from 'next/server';
import { requireClientAccess } from '@/lib/server/guard';
import { jsonOk, toErrorResponse } from '@/lib/server/http';
import { locaisDasZonasDoTime } from '@/lib/server/polling-place.service';

/**
 * Os locais de votacao (escola e secoes) das zonas pedidas, na UF do time:
 * e com eles que o painel do Lider mostra a escola de cada pessoa da Equipe
 * e as escolas, zonas e secoes onde ele tem gente.
 *
 * So dados publicos do TSE (nome, endereco, secoes): nenhum dado de pessoa.
 * `?zonas=10,11` — no maximo 40 zonas por pedido.
 */
export async function GET(request: NextRequest, ctx: RouteContext<'/api/clients/[id]/locais-de-votacao'>) {
  try {
    const { id } = await ctx.params;
    await requireClientAccess('member.view', id);
    const zonas = (request.nextUrl.searchParams.get('zonas') ?? '')
      .split(',')
      .map((z) => Number(z.trim()))
      .filter((z) => Number.isInteger(z) && z > 0)
      .slice(0, 40);
    return jsonOk({ locais: await locaisDasZonasDoTime(id, zonas) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
