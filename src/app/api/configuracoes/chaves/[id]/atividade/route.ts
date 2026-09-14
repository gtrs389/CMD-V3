import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, toErrorResponse } from '@/lib/server/http';
import { listApiKeyEvents } from '@/lib/server/api-key.service';

/**
 * O que uma chave da API fez. EXCLUSIVO do ADMIN geral.
 *
 * Este registro existe por uma razao precisa: a API gera o link COMO SE o
 * Administrador do time tivesse clicado no painel, e o rastreamento do link
 * fica — de proposito — indistinguivel de um clique humano. O rastro de que
 * a acao veio da API vive aqui, junto da chave.
 *
 * A resposta nao traz segredo, hash, token nem URL de convite: apenas o que
 * foi feito, em nome de quem, em que time e quando.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<'/api/configuracoes/chaves/[id]/atividade'>,
) {
  try {
    const user = await requirePermission('settings.view');
    if (user.role !== 'ADMIN') throw forbidden();

    const { id } = await ctx.params;
    return jsonOk({ events: await listApiKeyEvents(id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
