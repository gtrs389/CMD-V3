import type { NextRequest } from 'next/server';
import type { InviteState } from '@/lib/domain/invite-expiration';
import { apiJson, requireApiAdmin, toApiErrorResponse } from '@/lib/server/api-guard';
import { readJson } from '@/lib/server/http';
import { apiLinkCreateSchema } from '@/lib/validation/server.schema';
import { generateApiLink, listApiLinks } from '@/lib/server/api-link.service';

const ESTADOS: readonly InviteState[] = [
  'ACTIVE',
  'CLAIMED',
  'SUBMITTING',
  'CONSUMED',
  'EXPIRED',
  'REVOKED',
];

/**
 * `GET /api/v1/links`
 *
 * Links de cadastro existentes, do mais recente para o mais antigo.
 *
 * Filtros opcionais: `time`, `estado` e `limite`. O que venceu e marcado
 * como expirado na propria consulta, com o horario do banco — a lista nunca
 * mostra como ativo um link fora do prazo.
 */
export async function GET(request: NextRequest) {
  try {
    await requireApiAdmin(request);

    const params = request.nextUrl.searchParams;
    const estado = params.get('estado');
    const limite = Number(params.get('limite'));

    const links = await listApiLinks(request, {
      clientId: params.get('time')?.trim() || undefined,
      state: ESTADOS.includes((estado ?? '') as InviteState)
        ? (estado as InviteState)
        : undefined,
      limit: Number.isFinite(limite) && limite > 0 ? Math.trunc(limite) : undefined,
    });

    return apiJson({ links });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

/**
 * `POST /api/v1/links`
 *
 * Gera o link de cadastro de um time — o mesmo endereco que o Administrador
 * do time envia para as pessoas se cadastrarem.
 *
 * O link nasce COMO SE o dono tivesse clicado no painel: no rastreamento
 * ele aparece como dono e como gerador, com o prazo do perfil dele — nao ha
 * diferenca entre o link gerado aqui e o gerado por um clique.
 *
 * O endereco completo volta UMA vez, nesta resposta, e a geracao anterior
 * daquele dono deixa de funcionar no mesmo instante. A acao da chave fica
 * registrada em Configuracoes, junto da propria chave.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await requireApiAdmin(request);
    const input = await readJson(request, apiLinkCreateSchema);

    const link = await generateApiLink(
      request,
      { clientId: input.timeId, ownerId: input.donoId },
      caller,
    );

    return apiJson({ link }, 201);
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
