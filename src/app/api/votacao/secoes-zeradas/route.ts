import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { badRequest, jsonOk, toErrorResponse } from '@/lib/server/http';
import { secoesDosMunicipios } from '@/lib/server/votacao.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Todas as secoes das escolas dos municipios, com os votos de cada candidato
 * (o zero incluso): a base do PDF das secoes zeradas.
 *
 * `?candidatos=<id>,<id>&municipio=<nome>&municipio=<nome>`
 */
export async function GET(request: NextRequest) {
  try {
    await requirePermission('map.view');
    const params = request.nextUrl.searchParams;
    const ids = (params.get('candidatos') ?? '').split(',').map((id) => id.trim()).filter(Boolean);
    const municipios = [...new Set(params.getAll('municipio').map((m) => m.trim()).filter(Boolean))];
    if (ids.length === 0 || ids.length > 30 || !ids.every((id) => UUID.test(id))) throw badRequest('Escolha de 1 a 30 candidatos.');
    if (municipios.length === 0 || municipios.length > 20) throw badRequest('Escolha de 1 a 20 municípios.');
    return jsonOk(await secoesDosMunicipios(ids, municipios));
  } catch (error) {
    return toErrorResponse(error);
  }
}
