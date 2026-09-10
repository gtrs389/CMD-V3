import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, toErrorResponse } from '@/lib/server/http';
import { listMemberDevices } from '@/lib/server/device';

/**
 * Sinais tecnicos do aparelho, para a ficha do integrante.
 *
 * Rota protegida: exige sessao com permissao de leitura de integrante. O
 * servico devolve apenas colunas seguras, sem token, hash de IP ou qualquer
 * identificador tecnico.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/members/[id]/devices'>) {
  try {
    await requirePermission('member.view');
    const { id } = await ctx.params;
    return jsonOk({ devices: await listMemberDevices(id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
