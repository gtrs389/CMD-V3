import type { NextRequest } from 'next/server';
import { requireMemberAccess } from '@/lib/server/guard';
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
    const { id } = await ctx.params;
    // Sinal do aparelho e exclusivo do ADMIN: o time nunca alcanca.
    await requireMemberAccess('device.view', id);
    return jsonOk({ devices: await listMemberDevices(id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
