import type { NextRequest } from 'next/server';
import { apiJson, requireApiAdmin, toApiErrorResponse } from '@/lib/server/api-guard';
import { listApiTeams } from '@/lib/server/api-link.service';

/**
 * `GET /api/v1/times`
 *
 * Times e seus administradores ativos — os identificadores que o programa
 * precisa para pedir um link em `POST /api/v1/links`.
 *
 * EXCLUSIVO do ADMIN geral, como toda a API. A resposta traz apenas nome,
 * identificador e a chave de recrutamento: nada de telefone, e-mail, foto,
 * integrantes ou qualquer dado de pessoa cadastrada.
 */
export async function GET(request: NextRequest) {
  try {
    await requireApiAdmin(request);
    return apiJson({ times: await listApiTeams() });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
