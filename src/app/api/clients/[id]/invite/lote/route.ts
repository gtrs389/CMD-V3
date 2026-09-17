import type { NextRequest } from 'next/server';
import { requireClientAccess } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { inviteBatchSchema } from '@/lib/validation/server.schema';
import { issueTeamInviteBatch } from '@/lib/server/client.service';
import { publicLink } from '@/lib/server/public-origin';
import { invitePath } from '@/lib/utils/url';

/**
 * Gera VARIOS links de cadastro de uma vez (migration 043).
 *
 * Cada link vale para UMA pessoa: e por isso que mandar o cadastro para dez
 * pessoas pedia dez idas ao painel. Aqui os dez saem juntos, e os links que
 * ja existiam continuam valendo — nada e revogado.
 *
 * Os enderecos voltam UMA unica vez, nesta resposta: o banco guarda apenas o
 * hash de cada token. Fechou a tela sem copiar, aquele link nao aparece de
 * novo — e so gerar outro.
 *
 * Quem clica fica registrado como gerador no historico; o dono dos links
 * continua sendo o Administrador do time.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/clients/[id]/invite/lote'>,
) {
  try {
    const { id } = await ctx.params;
    const user = await requireClientAccess('invite.manage', id);

    const { quantidade } = await readJson(request, inviteBatchSchema);
    const emitidos = await issueTeamInviteBatch(id, quantidade, user.id);

    // O endereco completo sai daqui, com o dominio publico: quem gera esta no
    // painel, e o painel nao e o endereco que se divulga.
    const links = await Promise.all(
      emitidos.map(async (emitido) => ({
        token: emitido.token,
        url: await publicLink(request, invitePath(emitido.token)),
        issuedAt: emitido.issuedAt,
        expiresAt: emitido.expiresAt,
      })),
    );

    return jsonOk({ links });
  } catch (error) {
    return toErrorResponse(error);
  }
}
