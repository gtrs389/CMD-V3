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
 * votacao, o Administrador do time ve apenas a propria equipe. O ADMIN geral,
 * no mapa de um time, ve a lista daquele time — a mesma conta do pino.
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
        // Filtro "Lider" do mapa: a lista bate com o numero do pino.
        leaderId: params.get('lider') || undefined,
        // Fora do ADMIN, o recorte vem da sessao, nunca do endereco. O ADMIN
        // geral ve qualquer time; no mapa de UM time, a lista e so daquele
        // time — o mesmo recorte do pino. Sem isso a escola dizia 198 votos e
        // a lista trazia 294 pessoas: as dos outros times, inclusive a mesma
        // pessoa repetida no time duplicado. No mapa geral, sem `time`, segue
        // vendo todos os times.
        clientId: user.role === 'ADMIN' ? (params.get('time') ?? undefined) : (user.candidateId ?? undefined),
      }),
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
