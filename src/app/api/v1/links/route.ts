import type { NextRequest } from 'next/server';
import {
  apiJson,
  recordApiCall,
  requireApiKey,
  requireEmptyBody,
  toApiErrorResponse,
} from '@/lib/server/api-guard';
import { generateApiLink, listApiLinks } from '@/lib/server/api-link.service';

/**
 * `GET /api/v1/links`
 *
 * O link de cadastro do administrador vinculado a chave.
 *
 * O recorte por dono e aplicado na consulta ao banco: uma chave nunca ve o
 * link de outro administrador, nem de outro time. Como cada pessoa tem um
 * unico convite, a lista traz o link atual daquele administrador.
 *
 * O que venceu e marcado como expirado na propria consulta, com o horario do
 * banco — a lista nunca mostra como ativo um link fora do prazo.
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await requireApiKey(request);
    const links = await listApiLinks(request, caller);
    await recordApiCall(caller, 'LINK_LISTADO', links[0]?.id ?? null);

    return apiJson({ links });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

/**
 * `POST /api/v1/links`
 *
 * Gera o link de cadastro do administrador vinculado a chave.
 *
 * NAO RECEBE CAMPO NENHUM. Dono, time e prazo vem do vinculo imutavel da
 * chave, conferido no banco a cada chamada; `donoId` e `timeId` sao recusados
 * com 400. Uma chave do Joao gera o link do Joao, e so.
 *
 * O link nasce COMO SE ele tivesse entrado no painel e clicado em "Gerar
 * link": no rastreamento aparece como dono e como gerador, com o prazo do
 * perfil dele. Nao ha diferenca entre o link gerado aqui e o gerado por um
 * clique.
 *
 * O endereco completo volta UMA vez, nesta resposta, e a geracao anterior
 * daquele administrador deixa de funcionar no mesmo instante. A acao da
 * chave fica registrada em Configuracoes, junto da propria chave.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await requireApiKey(request);
    await requireEmptyBody(request);

    const link = await generateApiLink(request, caller);
    await recordApiCall(caller, 'LINK_GERADO', link.id);

    return apiJson({ link }, 201);
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
