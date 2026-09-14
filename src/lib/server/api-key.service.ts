import 'server-only';
import { randomBytes } from 'node:crypto';
import type {
  ApiKeyBinding,
  ApiKeyEvent,
  ApiKeySummary,
  BindableTeam,
  CreatedApiKey,
} from '@/lib/types';
import { API_KEY_MARK, API_KEY_NAME_MAX, apiKeyPrefix } from '@/lib/domain/api-key';
import { hashToken } from '@/lib/auth/tokens';
import {
  TABLES,
  type ApiKeyAction,
  type ApiKeyEventRow,
  type ApiKeyRow,
  type ClientRow,
  type UserRow,
} from '@/lib/supabase/tables';
import {
  callFunction,
  insertOne,
  insertRows,
  selectOne,
  selectRows,
  updateRows,
} from '@/lib/supabase/rest';
import { badRequest, notFound } from './http';

/**
 * Chaves da API de links de cadastro.
 *
 * EXCLUSIVAS DO ADMIN GERAL, em tudo: criar, listar, ver atividade e
 * revogar. O Administrador do time nao cria, nao ve e nao escolhe nada aqui
 * — ele apenas continua sendo quem aparece no historico dos links gerados
 * pela chave que leva o nome dele.
 *
 * Cada chave nasce com UM VINCULO IMUTAVEL (migration 031): um administrador
 * de um time. E dele que a API tira a identidade — nenhuma requisicao
 * escolhe dono nem time. Para trocar o administrador nao ha edicao: revoga-se
 * a chave e cria-se outra; o gatilho do banco recusa qualquer alteracao.
 *
 * O segredo nasce aqui, com `randomBytes`, e sai UMA unica vez — na resposta
 * da criacao. O banco recebe apenas o SHA-256 e o prefixo publico. O segredo
 * nunca entra em log, em mensagem de erro ou no historico.
 */

const COLUMNS =
  'id,name,prefix,created_by,created_by_name,created_at,last_used_at,request_count,' +
  'revoked_at,revoked_by,revoked_by_name,acting_user_id,acting_user_name,' +
  'acting_client_id,acting_client_name';

function toBinding(row: ApiKeyRow): ApiKeyBinding | null {
  if (!row.acting_user_id || !row.acting_client_id) return null;

  return {
    userId: row.acting_user_id,
    userName: row.acting_user_name ?? 'Não identificado',
    clientId: row.acting_client_id,
    clientName: row.acting_client_name ?? 'Time removido',
  };
}

function toSummary(row: ApiKeyRow): ApiKeySummary {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
    binding: toBinding(row),
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

  return rows.map(toSummary).sort((a, b) => Number(b.active) - Number(a.active));
}

/* -------------------------------------------------------------------------
   Quem pode receber uma chave
   ------------------------------------------------------------------------- */

/**
 * Times com os administradores que podem ser vinculados a uma chave.
 *
 * So entra quem PODE receber vinculo: usuario ATIVO, com perfil de
 * Administrador do time (CANDIDATE) e ligado aquele time. ADMIN geral,
 * integrante da equipe, acesso desativado e pessoa sem acesso ficam de fora
 * da lista — e tambem sao recusados na criacao, que confere de novo no
 * banco.
 *
 * Serve apenas a tela de Configuracoes: e a lista dos dois seletores.
 */
export async function listBindableTeams(): Promise<BindableTeam[]> {
  const [teams, admins] = await Promise.all([
    selectRows<Pick<ClientRow, 'id' | 'name'>>(TABLES.clients, {
      select: 'id,name',
      order: 'name.asc',
      limit: 500,
    }),
    selectRows<Pick<UserRow, 'id' | 'name' | 'client_id'>>(TABLES.users, {
      select: 'id,name,client_id',
      filters: { role: 'eq.CANDIDATE', is_active: 'is.true' },
      order: 'name.asc',
      limit: 2000,
    }),
  ]);

  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    admins: admins
      .filter((admin) => admin.client_id === team.id)
      .map((admin) => ({ id: admin.id, name: admin.name })),
  }));
}

/* -------------------------------------------------------------------------
   Criacao e revogacao
   ------------------------------------------------------------------------- */

export interface CreateApiKeyInput {
  name: string;
  /** Time da chave. */
  clientId: string;
  /** Administrador ATIVO daquele time em nome de quem a chave vai agir. */
  actingUserId: string;
}

/**
 * Cria uma chave vinculada e devolve o segredo, pela unica vez.
 *
 * 32 bytes aleatorios em base64url: 256 bits de entropia, o mesmo material
 * dos tokens de sessao. O valor devolvido nao e gravado em lugar nenhum.
 *
 * O vinculo e conferido contra o BANCO, e nao contra a tela: o administrador
 * precisa existir, estar ativo, ter perfil de Administrador do time e
 * pertencer AO TIME informado. ADMIN geral, integrante da equipe, pessoa sem
 * acesso e usuario de outro time sao recusados aqui.
 */
export async function createApiKey(
  input: CreateApiKeyInput,
  admin: { id: string; name: string },
): Promise<CreatedApiKey> {
  const apelido = input.name.trim();
  if (!apelido) throw badRequest('Dê um nome para identificar a chave.');
  if (apelido.length > API_KEY_NAME_MAX) {
    throw badRequest(`O nome da chave deve ter até ${API_KEY_NAME_MAX} caracteres.`);
  }

  const team = await selectOne<Pick<ClientRow, 'id' | 'name'>>(TABLES.clients, {
    select: 'id,name',
    filters: { id: `eq.${input.clientId}` },
  });
  if (!team) throw notFound('Time não encontrado.');

  const owner = await selectOne<Pick<UserRow, 'id' | 'name' | 'role' | 'client_id' | 'is_active'>>(
    TABLES.users,
    {
      select: 'id,name,role,client_id,is_active',
      filters: { id: `eq.${input.actingUserId}` },
    },
  );

  if (!owner) throw notFound('Administrador do time não encontrado.');
  if (owner.role !== 'CANDIDATE') {
    throw badRequest('A chave só pode ser vinculada a um administrador do time.');
  }
  if (owner.client_id !== team.id) {
    throw badRequest('Este administrador não pertence ao time escolhido.');
  }
  if (!owner.is_active) throw badRequest('O acesso deste administrador está desativado.');

  const token = `${API_KEY_MARK}${randomBytes(32).toString('base64url')}`;

  const row = await insertOne<ApiKeyRow>(
    TABLES.apiKeys,
    {
      name: apelido,
      prefix: apiKeyPrefix(token),
      token_hash: hashToken(token),
      created_by: admin.id,
      created_by_name: admin.name,
      acting_user_id: owner.id,
      acting_user_name: owner.name,
      acting_client_id: team.id,
      acting_client_name: team.name,
    },
    COLUMNS,
  );

  return { ...toSummary(row), token };
}

/**
 * Revoga a chave. A partir daqui ela responde 401 em qualquer chamada.
 *
 * Nada e apagado: a linha permanece com a data e o nome de quem revogou,
 * junto do total de chamadas que ela fez enquanto valia. Os links ja gerados
 * por ela continuam valendo — revogar chave nao derruba link.
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

/* -------------------------------------------------------------------------
   Autenticacao
   ------------------------------------------------------------------------- */

/** Chave autenticada, com o vinculo inteiro ja conferido no banco. */
export interface ResolvedApiKey {
  keyId: string;
  keyName: string;
  /** ADMIN geral que criou a chave: quem autoriza. */
  adminUserId: string;
  adminName: string;
  /** Administrador do time em nome de quem a chave age. */
  actingUserId: string;
  actingUserName: string;
  clientId: string;
  clientName: string;
}

/** Chave encontrada, porem recusada. Serve apenas para registrar a recusa. */
export interface RefusedApiKey {
  keyId: string;
  keyName: string;
  adminUserId: string | null;
  adminName: string | null;
  actingUserId: string | null;
  actingUserName: string | null;
  clientId: string | null;
  clientName: string | null;
  /** Motivo tecnico. Fica no servidor e no registro; nunca vai na resposta. */
  reason: string;
}

export type ApiKeyResolution =
  | { ok: true; key: ResolvedApiKey }
  | { ok: false; key: RefusedApiKey }
  | null;

interface ResolveRow {
  key_id: string;
  key_name: string;
  admin_user_id: string | null;
  admin_name: string | null;
  acting_user_id: string | null;
  acting_user_name: string | null;
  client_id: string | null;
  client_name: string | null;
  allowed: boolean;
  reason: string | null;
}

/**
 * Confere o segredo recebido no cabecalho `Authorization`.
 *
 * O banco resolve tudo em uma transacao: encontra a chave pelo SHA-256 e
 * confere revogacao, vinculo, ADMIN geral ativo, administrador do time ativo
 * com o perfil certo, o vinculo ainda apontando para o mesmo time e o time
 * ainda existindo. Qualquer falha derruba a chave na hora.
 *
 * O motivo volta para o SERVIDOR, e so para ele: serve para registrar a
 * recusa junto da chave. Para quem chamou, todas as recusas sao iguais.
 *
 * `null` significa "nenhuma chave com esse segredo" — ai nao ha nem o que
 * registrar.
 */
export async function resolveApiKey(token: string): Promise<ApiKeyResolution> {
  const rows = await callFunction<ResolveRow[]>('cmd_api_key_resolve', {
    p_token_hash: hashToken(token),
  });

  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.key_id) return null;

  if (!row.allowed || !row.acting_user_id || !row.client_id || !row.admin_user_id) {
    return {
      ok: false,
      key: {
        keyId: row.key_id,
        keyName: row.key_name,
        adminUserId: row.admin_user_id,
        adminName: row.admin_name,
        actingUserId: row.acting_user_id,
        actingUserName: row.acting_user_name,
        clientId: row.client_id,
        clientName: row.client_name,
        reason: row.reason ?? 'chave sem vinculo válido',
      },
    };
  }

  return {
    ok: true,
    key: {
      keyId: row.key_id,
      keyName: row.key_name,
      adminUserId: row.admin_user_id,
      adminName: row.admin_name ?? 'Administração',
      actingUserId: row.acting_user_id,
      actingUserName: row.acting_user_name ?? 'Não identificado',
      clientId: row.client_id,
      clientName: row.client_name ?? 'Time',
    },
  };
}

/* -------------------------------------------------------------------------
   Atividade da chave
   ------------------------------------------------------------------------- */

const EVENT_COLUMNS =
  'id,api_key_id,key_name,admin_user_id,admin_name,action,result,detail,invite_id,client_id,' +
  'client_name,owner_user_id,owner_name,owner_role,occurred_at';

function toEvent(row: ApiKeyEventRow): ApiKeyEvent {
  return {
    id: row.id,
    action: row.action,
    result: row.result ?? 'SUCESSO',
    detail: row.detail,
    occurredAt: row.occurred_at,
    keyName: row.key_name,
    adminName: row.admin_name,
    clientName: row.client_name,
    ownerName: row.owner_name,
    ownerRole: row.owner_role,
    inviteId: row.invite_id,
  };
}

export interface ApiKeyEventInput {
  keyId: string;
  keyName: string;
  /** ADMIN geral responsavel pela chave. */
  adminUserId: string | null;
  adminName: string | null;
  action: ApiKeyAction;
  result: 'SUCESSO' | 'RECUSADO';
  /** Motivo da recusa. Fica so aqui. */
  detail?: string | null;
  inviteId?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  /** Administrador do time em nome de quem a chave agiu. */
  ownerUserId?: string | null;
  ownerName?: string | null;
  ownerRole?: string | null;
}

/**
 * Registra o que a chave fez — inclusive quando ela foi recusada.
 *
 * E o contrapeso de a API agir COMO O DONO: o historico do link fica
 * indistinguivel de um clique do proprio Administrador do time, que e o
 * comportamento desejado, e o rastro de que aquilo veio da API vive aqui,
 * com a chave, o ADMIN geral que a criou, o time e o resultado.
 *
 * Uma falha ao registrar nunca derruba a operacao: o link ja foi gerado, e
 * transformar isso em erro faria a pessoa gerar de novo, criando um segundo
 * link e derrubando o primeiro. A falha vai para o log do servidor.
 */
export async function recordApiKeyEvent(input: ApiKeyEventInput): Promise<void> {
  try {
    await insertRows<ApiKeyEventRow>(
      TABLES.apiKeyEvents,
      [
        {
          api_key_id: input.keyId,
          key_name: input.keyName,
          admin_user_id: input.adminUserId,
          admin_name: input.adminName,
          action: input.action,
          result: input.result,
          detail: input.detail ?? null,
          invite_id: input.inviteId ?? null,
          client_id: input.clientId ?? null,
          client_name: input.clientName ?? null,
          owner_user_id: input.ownerUserId ?? null,
          owner_name: input.ownerName ?? null,
          owner_role: input.ownerRole ?? null,
        },
      ],
      'id',
    );
  } catch (error) {
    console.error('[cmd] Não foi possível registrar a ação da chave da API:', error);
  }
}

/** Ultimas acoes de uma chave, da mais recente para a mais antiga. */
export async function listApiKeyEvents(keyId: string, limit = 30): Promise<ApiKeyEvent[]> {
  const rows = await selectRows<ApiKeyEventRow>(TABLES.apiKeyEvents, {
    select: EVENT_COLUMNS,
    filters: { api_key_id: `eq.${keyId}` },
    order: 'occurred_at.desc',
    limit,
  });

  return rows.map(toEvent);
}
