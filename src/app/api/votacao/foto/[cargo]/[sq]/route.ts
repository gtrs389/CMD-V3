import type { NextRequest } from 'next/server';
import { CARGOS_DA_APURACAO, urlDaFoto } from '@/lib/domain/tse-ao-vivo';
import { requirePermission } from '@/lib/server/guard';
import { notFound, toErrorResponse } from '@/lib/server/http';
import { configuracaoAoVivo } from '@/lib/server/votacao-ao-vivo.service';

/**
 * Foto oficial do candidato, buscada no TSE pelo servidor.
 *
 * Passa pelo servidor (e nao direto do navegador ao TSE) porque o TSE pode
 * recusar acesso de fora; e fica em cache no navegador por um dia — a foto
 * nao muda durante a eleicao.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/votacao/foto/[cargo]/[sq]'>) {
  try {
    await requirePermission('map.view');
    const { cargo, sq } = await ctx.params;
    const info = CARGOS_DA_APURACAO.find((x) => String(x.codigo) === cargo);
    if (!info || !/^[0-9]{1,20}$/.test(sq)) throw notFound('Foto não encontrada.');

    const c = configuracaoAoVivo();
    const resposta = await fetch(urlDaFoto(c, c.uf, info.federal, sq), {
      signal: AbortSignal.timeout(10_000),
      cache: 'force-cache',
    }).catch(() => null);
    if (!resposta?.ok) throw notFound('Foto não encontrada.');

    return new Response(await resposta.arrayBuffer(), {
      headers: {
        'Content-Type': resposta.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
