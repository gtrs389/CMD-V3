import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { notFound, toErrorResponse } from '@/lib/server/http';
import { fotoDoCandidato, respostaDaFoto } from '@/lib/server/foto-do-candidato.service';

/** Foto oficial do candidato pelo sequencial do TSE (Sala de Apuracao). */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/votacao/foto/[cargo]/[sq]'>) {
  try {
    await requirePermission('map.view');
    const { cargo, sq } = await ctx.params;
    const foto = await fotoDoCandidato(Number(cargo), sq);
    if (!foto) throw notFound('Foto não encontrada.');
    return respostaDaFoto(foto);
  } catch (error) {
    return toErrorResponse(error);
  }
}
