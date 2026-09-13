import 'server-only';
import { randomBytes } from 'node:crypto';
import type { ApiKeySummary, CreatedApiKey } from '@/lib/types';
import { API_KEY_MARK, API_KEY_NAME_MAX, apiKeyPrefix } from '@/lib/domain/api-key';
import { hashToken } from '@/lib/auth/tokens';
import { TABLES, type ApiKeyRow } from '@/lib/supabase/tables';
import { callFunction, insertOne, selectRows, updateRows } from '@/lib/supabase/rest';
import { badRequest, notFound } from './http';

/**
 * Chaves da API de links de cadastro.
 *
 * Exclusivas do ADMIN geral: as rotas de gestao exigem `settings.manage` e o
 * perfil ADMIN, e a propria autenticacao da chave so vale enquanto o ADMIN
 * que a criou continuar ativo.
 *
 * O segredo nasce aqui, com `randomBytes`, e sai UMA unica vez — na resposta
 * da criacao. O banco recebe apenas o SHA-256 e o prefixo publico. Nao ha
 * consulta que devolva o segredo depois: perdido, revoga-se e cria-se outro.
 *
 * O segredo nunca entra em log, em mensagem de erro ou no historico.
 */

const COLUMNS =
  'id,name,prefix,created_by,created_by_name,created_at,last_used_at,request_count,' +
  'revoked_at,revoked_by,revoked_by_name';

function toSummary(row: ApiKeyRow): ApiKeySummary {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
    lastUsedAt: row.last_used_at,
    requestCount: Number(row.request_count ?? 0),
    revokedAt: row.revoked_at,
    revokedByName: row.revoked_by_name,
    active: row.revoked_at === null,
  };
}

/** Lista as chaves: ativas primeiro, mais novas no topo. */
export async function listApiKeys(): Promise<ApiKeySummary[]> {
  const rows = await selectRows<ApiKeyRow>(TABLES.apiKeys, {
    select: COLUMNS,
    order: 'created_at.desc',
    limit: 200,
  });

  return rows
    .map(toSummary)
    .sort((a, b) => Number(b.active) - Number(a.active));
}

/**
 * Cria uma chave e devolve o segredo, pela unica vez.
 *
 * 32 bytes aleatorios em base64url: 256 bits de entropia, o mesmo material
 * dos tokens de sessao. O valor devolvido nao e gravado em lugar nenhum.
 */
export async function createApiKey(
  name: string,
  admin: { id: string; name: string },
): Promise<CreatedApiKey> {
  const apelido = name.trim();
  if (!apelido) throw badRequest('Dê um nome para identificar a chave.');
  if (apelido.length > API_KEY_NAME_MAX) {
    throw badRequest(`O nome da chave deve ter até ${API_KEY_NAME_MAX} caracteres.`);
  }

  const token = `${API_KEY_MARK}${randomBytes(32).toString('base64url')}`;

  const row = await insertOne<ApiKeyRow>(
    TABLES.apiKeys,
    {
      name: apelido,
      prefix: apiKeyPrefix(token),
      token_hash: hashToken(token),
      created_by: admin.id,
      created_by_name: admin.name,
    },
    COLUMNS,
  );

  return { ...toSummary(row), token };
}

/**
 * Revoga a chave. A partir daqui ela responde 401 em qualquer chamada.
 *
 * Nada e apagado: a linha permanece com a data e o nome de quem revogou,
 * junto do total de chamadas que ela fez enquanto valia.
 */
export async function revokeApiKey(
  id: string,
  admin: { id: string; name: string },
): Promise<ApiKeySummary> {
  const [row] = await updateRows<ApiKeyRow>(
    TABLES.apiKeys,
    { id: `eq.${id}`, revoked_at: 'is.null' },
    { revoked_at: new Date().toISOString(), revoked_by: admin.id, revoked_by_name: admin.name },
    COLUMNS,
  );

  if (!row) throw notFound('Chave não encontrada ou já revogada.');
  return toSummary(row);
}

/** Chave autenticada, com a identidade que ela carrega. */
export interface AuthenticatedApiKey {
  keyId: string;
  keyName: string;
  /** ADMIN dono da chave: e em nome dele que a API age. */
  userId: string;
  userName: string;
}

interface AuthRow {
  key_id: string;
  key_name: string;
  user_id: string;
  user_name: string;
}

/**
 * Confere o segredo recebido no cabecalho `Authorization`.
 *
 * O banco resolve tudo em uma transacao: encontra a chave pelo SHA-256,
 * recusa a revogada e a que perdeu o dono ADMIN ativo, e contabiliza o uso.
 * Chave invalida nao movimenta contador nenhum.
 *
 * Devolve `null` — e nunca o motivo — para a rota responder sempre a mesma
 * coisa: chave inexistente, revogada e dono desativado sao indistinguiveis
 * de fora.
 */
export async function authenticateApiKey(token: string): Promise<AuthenticatedApiKey | null> {
  const rows = await callFunction<AuthRow[]>('cmd_api_key_auth', {
    p_token_hash: hashToken(token),
  });

  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.key_id || !row.user_id) return null;

  return {
    keyId: row.key_id,
    keyName: row.key_name,
    userId: row.user_id,
    userName: row.user_name,
  };
}
