import type { NextRequest } from 'next/server';
import {
  apiJson,
  recordApiCall,
  requireApiKey,
  toApiErrorResponse,
} from '@/lib/server/api-guard';
import { getApiLink, revokeApiLink } from '@/lib/server/api-link.service';

/**
 * `GET /api/v1/links/{id}`
 *
 * Situacao de um link do administrador vinculado: estado, prazo, primeiro
 * acesso e conclusao.
 *
 * Link de outro administrador responde "nao encontrado", e nao "sem
 * permissao": a chave nao chega nem a saber que ele existe.
 *
 * Nao devolve nenhum dado da pessoa que se cadastrou — para isso existe o
 * painel, onde o acesso e conferido cadastro a cadastro.
 */
export async function GET(request: NextRequest, ctx: RouteContext<'/api/v1/links/[id]'>) {
  try {
    const caller = await requireApiKey(request);
    const { id } = await ctx.params;

    const link = await getApiLink(request, caller, id);
    await recordApiCall(caller, 'LINK_CONSULTADO', link.id);

    return apiJson({ link });
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
 * So alcanca link do proprio administrador vinculado. E o que fazer quando o
 * endereco foi enviado para a pessoa errada. Repetir a chamada devolve o
 * mesmo resultado. Link ja usado para um cadastro nao e revogado — o
 * cadastro existe, e apagar o estado final falsificaria o historico.
 */
export async function DELETE(request: NextRequest, ctx: RouteContext<'/api/v1/links/[id]'>) {
  try {
    const caller = await requireApiKey(request);
    const { id } = await ctx.params;

    const link = await revokeApiLink(request, caller, id);
    await recordApiCall(caller, 'LINK_REVOGADO', link.id);

    return apiJson({ link });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
