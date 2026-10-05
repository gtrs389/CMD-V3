import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { notFound, toErrorResponse } from '@/lib/server/http';
import { fotoDoCandidato, respostaDaFoto, sqcandPeloNumero } from '@/lib/server/foto-do-candidato.service';

/**
 * Foto oficial do candidato pelo numero de urna: e assim que o mapa e os
 * PDFs conhecem o candidato. O sequencial sai da apuracao ja gravada.
 */
export async function GET(request: NextRequest, ctx: RouteContext<'/api/votacao/foto/[cargo]/numero/[numero]'>) {
  try {
    await requirePermission('map.view');
    const { cargo, numero } = await ctx.params;
    const ano = Number(request.nextUrl.searchParams.get('ano'));
    const sq = await sqcandPeloNumero(Number(cargo), numero, Number.isInteger(ano) && ano > 0 ? ano : undefined);
    const foto = sq ? await fotoDoCandidato(Number(cargo), sq) : null;
    if (!foto) throw notFound('Foto não encontrada.');
    return respostaDaFoto(foto);
  } catch (error) {
    return toErrorResponse(error);
  }
}
