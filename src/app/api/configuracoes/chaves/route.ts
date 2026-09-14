import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { apiKeyCreateSchema } from '@/lib/validation/server.schema';
import { createApiKey, listApiKeys } from '@/lib/server/api-key.service';

/**
 * Chaves da API de links de cadastro. EXCLUSIVO do ADMIN geral.
 *
 * Duas barreiras, como no rastreamento dos links: a permissao
 * `settings.manage` e o perfil ADMIN. Administrador do time (CANDIDATE) e
 * integrante EQUIPE recebem 403 — bater direto nesta rota nao devolve nem a
 * lista. Eles nao criam, nao veem, nao vinculam e nao revogam chave nenhuma.
 *
 * A resposta nunca traz o segredo nem o hash dele: apenas o prefixo publico,
 * o vinculo, o uso e as datas.
 */
async function requireAdminGeral() {
  const user = await requirePermission('settings.manage');
  if (user.role !== 'ADMIN') throw forbidden();
  return user;
}

export async function GET() {
  try {
    await requireAdminGeral();
    return jsonOk({ keys: await listApiKeys() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Cria uma chave JA VINCULADA a um administrador de um time.
 *
 * Nao existe chave generica: sem time e sem administrador a criacao e
 * recusada. O vinculo e imutavel — para trocar o administrador, revogue esta
 * chave e crie outra.
 *
 * O segredo volta UMA unica vez, nesta resposta, e o banco guarda apenas o
 * SHA-256. Perdido o valor, a saida e revogar e criar outra.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdminGeral();
    const input = await readJson(request, apiKeyCreateSchema);

    const key = await createApiKey(input, { id: user.id, name: user.name });
    return jsonOk({ key }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
