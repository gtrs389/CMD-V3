import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, toErrorResponse } from '@/lib/server/http';
import { placeMembers } from '@/lib/server/map-location.service';

/**
 * Pessoas que votam em um local, carregadas so depois do clique.
 *
 * Exige ver o mapa e ver integrantes. A lista traz apenas foto, nome,
 * cliente, zona/secao e, quando existirem, telefone e e-mail. CPF, dados da
 * consulta cadastral e sinais do aparelho nunca passam por aqui.
 *
 * Fora do ADMIN a lista fica restrita a operacao da sessao: no mesmo local de
 * votacao, o Administrador do time ve apenas a propria equipe.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<'/api/mapa/locais/[locationId]/integrantes'>,
) {
  try {
    await requirePermission('map.view');
    const user = await requirePermission('member.view');

    const { locationId } = await ctx.params;
    const params = new URL(request.url).searchParams;

    if (user.role !== 'ADMIN' && !user.candidateId) throw forbidden();

    return jsonOk(
      await placeMembers(locationId, {
        search: params.get('busca') ?? '',
        page: Number(params.get('pagina') ?? '1'),
        pageSize: Number(params.get('tamanho') ?? '20'),
        // O recorte vem da sessao, nunca do endereco.
        clientId: user.role === 'ADMIN' ? undefined : (user.candidateId ?? undefined),
      }),
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
