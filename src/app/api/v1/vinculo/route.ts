import type { NextRequest } from 'next/server';
import { apiJson, requireApiKey, toApiErrorResponse } from '@/lib/server/api-guard';
import { getApiBinding } from '@/lib/server/api-link.service';

/**
 * `GET /api/v1/vinculo`
 *
 * A quem esta chave pertence: o time e o administrador em nome de quem os
 * links vao sair. Substitui a antiga listagem de times — nao ha mais o que
 * escolher, e portanto nao ha mais lista.
 *
 * Serve para o sistema externo confirmar o vinculo antes de gerar qualquer
 * coisa, e para diagnosticar integracao trocada: se o nome que volta aqui
 * nao e o esperado, a chave configurada e outra.
 *
 * Nenhum dado de pessoa cadastrada sai daqui.
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await requireApiKey(request);
    return apiJson(await getApiBinding(caller));
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
