import type { NextRequest } from 'next/server';
import { apiJson, requireApiAdmin, toApiErrorResponse } from '@/lib/server/api-guard';
import { getApiLink, revokeApiLink } from '@/lib/server/api-link.service';

/**
 * `GET /api/v1/links/{id}`
 *
 * Situacao de um link: estado, prazo, primeiro acesso e conclusao.
 *
 * Nao devolve nenhum dado da pessoa que se cadastrou — para isso existe o
 * painel, onde o acesso e conferido cadastro a cadastro.
 */
export async function GET(request: NextRequest, ctx: RouteContext<'/api/v1/links/[id]'>) {
  try {
    await requireApiAdmin(request);
    const { id } = await ctx.params;
    return apiJson({ link: await getApiLink(request, id) });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

/**
 * `DELETE /api/v1/links/{id}`
 *
 * Derruba o link na hora, sem por outro no lugar: quem abrir o endereco ve a
 * tela de link indisponivel.
 *
 * E o que fazer quando o link foi enviado para a pessoa errada. Repetir a
 * chamada devolve o mesmo resultado. Link ja usado para um cadastro nao e
 * revogado — o cadastro existe, e apagar o estado final falsificaria o
 * historico.
 */
export async function DELETE(request: NextRequest, ctx: RouteContext<'/api/v1/links/[id]'>) {
  try {
    const caller = await requireApiAdmin(request);
    const { id } = await ctx.params;
    return apiJson({ link: await revokeApiLink(request, id, caller.userId) });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
