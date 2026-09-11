import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, toErrorResponse } from '@/lib/server/http';
import { releaseUserDevice } from '@/lib/server/user.service';

/**
 * Libera um novo aparelho.
 *
 * Vale para os dois perfis que entram por link do time + telefone: o
 * Administrador do time e o membro da equipe. Revoga o aparelho autorizado e
 * todas as sessoes daquele usuario, na mesma transacao do banco. Telefone,
 * nome, foto, time e link nao sao tocados: o proximo acesso valido vincula o
 * navegador novo.
 *
 * Exclusivo do ADMIN geral. `settings.manage` ja e uma permissao so desse
 * perfil; o papel e conferido de novo para o escopo nunca depender apenas da
 * matriz. Administrador do time e EQUIPE recebem 403 ao tentar usar a acao.
 *
 * Nenhum dado do aparelho, do usuario ou do telefone sai nesta resposta.
 */
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<'/api/usuarios/[id]/aparelho'>,
) {
  try {
    const current = await requirePermission('settings.manage');
    if (current.role !== 'ADMIN') throw forbidden();

    const { id } = await ctx.params;
    return jsonOk({ released: await releaseUserDevice(id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
