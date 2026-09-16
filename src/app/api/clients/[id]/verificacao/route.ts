import type { NextRequest } from 'next/server';
import { requireClientAccess } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { verificationToggleSchema } from '@/lib/validation/server.schema';
import { setVerificationEnabled } from '@/lib/server/client.service';

/**
 * Confirmacao de dados pela FonteData, time a time (migration 041).
 *
 * Rota propria, e nao um campo em "editar time": `client.update` tambem
 * pertence ao Administrador do TIME, e quem decide gastar — ou parar de
 * gastar — com consulta e o ADMIN geral. `form.manage` e exclusiva dele, a
 * mesma permissao que ja manda no restante do construtor do formulario, e o
 * escopo do time e conferido junto.
 *
 * Desligada, nenhum cadastro deste time consulta o fornecedor, e zona e
 * secao viram campos obrigatorios do formulario publico. Quem confere isso e
 * o servidor, em cada rota que chegaria na FonteData: esconder o botao na
 * tela nunca foi protecao.
 */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/clients/[id]/verificacao'>,
) {
  try {
    const { id } = await ctx.params;
    await requireClientAccess('form.manage', id);

    const { enabled } = await readJson(request, verificationToggleSchema);

    return jsonOk({ client: await setVerificationEnabled(id, enabled) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
