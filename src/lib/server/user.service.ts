import 'server-only';
import type {
  AccessStatus,
  CandidateWithoutAccess,
  GeneratedCredential,
  Role,
  SystemUser,
} from '@/lib/types';
import { hashPassword } from '@/lib/auth/password';
import { generateTempPassword } from '@/lib/auth/temp-password';
import { TABLES, type ClientRow, type UserRow } from '@/lib/supabase/tables';
import { callFunction, inFilter, insertOne, selectOne, selectRows, updateRows } from '@/lib/supabase/rest';
import { signedUrls } from '@/lib/supabase/storage';
import { ApiError, badRequest, notFound } from './http';

/**
 * Usuarios do sistema: ADMINs e candidatos com acesso.
 *
 * Integrantes cadastrados pelos links publicos nao entram aqui em nenhuma
 * hipotese: eles vivem em `cmd_members` e nao possuem login.
 *
 * Senha em texto puro nunca e gravada nem registrada. A geracao devolve o
 * valor uma unica vez, na resposta da acao; no banco fica apenas o hash
 * scrypt calculado aqui.
 */

const USER_COLUMNS =
  'id,name,email,role,client_id,is_active,must_change_password,password_hash,last_login_at,created_at';

type UserColumns = Pick<
  UserRow,
  | 'id'
  | 'name'
  | 'email'
  | 'role'
  | 'client_id'
  | 'is_active'
  | 'must_change_password'
  | 'password_hash'
  | 'last_login_at'
  | 'created_at'
>;

/** E-mail ja usado por outro usuario. Mensagem unica em todo o sistema. */
export const EMAIL_IN_USE = 'E-mail já utilizado por outro usuário.';

export function emailConflict(): ApiError {
  return new ApiError(409, EMAIL_IN_USE);
}

/** Sem senha utilizavel o acesso esta pendente; desativado vem antes de ativo. */
export function accessStatus(row: Pick<UserColumns, 'is_active' | 'password_hash'>): AccessStatus {
  if (!row.is_active) return 'DISABLED';
  return row.password_hash ? 'ACTIVE' : 'PENDING';
}

async function findUserByEmail(email: string): Promise<UserColumns | null> {
  return selectOne<UserColumns>(TABLES.users, {
    select: USER_COLUMNS,
    filters: { email: `eq.${email.trim().toLowerCase()}` },
  });
}

async function findUserByClient(clientId: string): Promise<UserColumns | null> {
  return selectOne<UserColumns>(TABLES.users, {
    select: USER_COLUMNS,
    filters: { client_id: `eq.${clientId}` },
  });
}

async function requireUser(userId: string): Promise<UserColumns> {
  const row = await selectOne<UserColumns>(TABLES.users, {
    select: USER_COLUMNS,
    filters: { id: `eq.${userId}` },
  });
  if (!row) throw notFound('Usuário não encontrado.');
  return row;
}

/* -------------------------------------------------------------------------
   Listagem
   ------------------------------------------------------------------------- */

export async function listSystemUsers(currentUserId: string): Promise<SystemUser[]> {
  const rows = await selectRows<UserColumns>(TABLES.users, {
    select: USER_COLUMNS,
    filters: { role: 'in.(ADMIN,CANDIDATE)' },
    order: 'created_at.asc',
  });
  if (rows.length === 0) return [];

  const clientIds = rows
    .map((row) => row.client_id)
    .filter((id): id is string => Boolean(id));

  const clients = clientIds.length
    ? await selectRows<Pick<ClientRow, 'id' | 'name' | 'photo_path'>>(TABLES.clients, {
        select: 'id,name,photo_path',
        filters: { id: inFilter(clientIds) },
      })
    : [];

  const photos = await signedUrls(clients.map((client) => client.photo_path));
  const byId = new Map(
    clients.map((client, index) => [
      client.id,
      { id: client.id, name: client.name, photo: photos[index] ?? null },
    ]),
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as Role,
    status: accessStatus(row),
    candidate: row.client_id ? (byId.get(row.client_id) ?? null) : null,
    lastLoginAt: row.last_login_at,
    mustChangePassword: row.must_change_password,
    createdAt: row.created_at,
    self: row.id === currentUserId,
  }));
}

/**
 * Candidatos que ainda nao possuem usuario.
 *
 * Acontece quando o e-mail estava em uso por outra conta no momento do
 * cadastro. Eles aparecem em Configuracoes como acesso pendente.
 */
export async function listCandidatesWithoutAccess(): Promise<CandidateWithoutAccess[]> {
  const clients = await selectRows<Pick<ClientRow, 'id' | 'name' | 'email' | 'photo_path'>>(
    TABLES.clients,
    { select: 'id,name,email,photo_path', order: 'created_at.asc' },
  );
  if (clients.length === 0) return [];

  const users = await selectRows<Pick<UserColumns, 'client_id'>>(TABLES.users, {
    select: 'client_id',
    filters: { client_id: inFilter(clients.map((client) => client.id)) },
  });
  const vinculados = new Set(users.map((user) => user.client_id));

  const pendentes = clients.filter((client) => !vinculados.has(client.id));
  const photos = await signedUrls(pendentes.map((client) => client.photo_path));

  return pendentes.map((client, index) => ({
    clientId: client.id,
    name: client.name,
    email: client.email,
    photo: photos[index] ?? null,
  }));
}

/* -------------------------------------------------------------------------
   Geracao de acesso
   ------------------------------------------------------------------------- */

interface CandidateSeed {
  id: string;
  name: string;
  email: string;
}

/**
 * Cria ou renova a senha temporaria de um candidato.
 *
 * Devolve `null` quando o e-mail ja pertence a outro usuario: nesse caso
 * nada e sobrescrito e quem chamou mostra a mensagem padrao.
 */
async function grantForCandidate(client: CandidateSeed): Promise<GeneratedCredential | null> {
  const existing = await findUserByClient(client.id);
  const password = generateTempPassword();
  const passwordHash = await hashPassword(password);

  if (existing) {
    await callFunction<number>('cmd_set_temp_password', {
      p_user_id: existing.id,
      p_password_hash: passwordHash,
    });
    // Reativa o acesso: gerar senha e sempre um convite para entrar.
    await updateRows<UserRow>(TABLES.users, { id: `eq.${existing.id}` }, { is_active: true }, 'id');
    return { userId: existing.id, name: existing.name, email: existing.email, password };
  }

  const email = client.email.trim().toLowerCase();
  const conflict = await findUserByEmail(email);
  if (conflict) return null;

  const row = await insertOne<Pick<UserRow, 'id' | 'name' | 'email'>>(
    TABLES.users,
    {
      name: client.name,
      email,
      role: 'CANDIDATE',
      client_id: client.id,
      password_hash: passwordHash,
      must_change_password: true,
      is_active: true,
    },
    'id,name,email',
  );

  return { userId: row.id, name: row.name, email: row.email, password };
}

/** Acesso de um candidato, criado logo apos o cadastro. */
export async function createCandidateAccess(
  client: CandidateSeed,
): Promise<GeneratedCredential | null> {
  return grantForCandidate(client);
}

export interface GrantOutcome {
  credentials: GeneratedCredential[];
  /** Candidatos ignorados porque o e-mail pertence a outro usuario. */
  conflicts: { clientId: string; name: string; email: string }[];
}

/** Gera o acesso de um candidato especifico, a pedido do ADMIN. */
export async function grantAccess(clientId: string): Promise<GrantOutcome> {
  const client = await selectOne<Pick<ClientRow, 'id' | 'name' | 'email'>>(TABLES.clients, {
    select: 'id,name,email',
    filters: { id: `eq.${clientId}` },
  });
  if (!client) throw notFound('Candidato não encontrado.');

  const credential = await grantForCandidate(client);
  if (!credential) {
    return {
      credentials: [],
      conflicts: [{ clientId: client.id, name: client.name, email: client.email }],
    };
  }
  return { credentials: [credential], conflicts: [] };
}

/**
 * Gera de uma vez o acesso de todos os candidatos ainda pendentes.
 *
 * Pendente e quem nao tem usuario ou esta sem senha utilizavel. Quem ja
 * definiu a senha nao e tocado: a senha atual continua valendo.
 */
export async function grantPendingAccess(): Promise<GrantOutcome> {
  const clients = await selectRows<Pick<ClientRow, 'id' | 'name' | 'email'>>(TABLES.clients, {
    select: 'id,name,email',
    order: 'created_at.asc',
  });
  if (clients.length === 0) return { credentials: [], conflicts: [] };

  const users = await selectRows<UserColumns>(TABLES.users, {
    select: USER_COLUMNS,
    filters: { client_id: inFilter(clients.map((client) => client.id)) },
  });
  const byClient = new Map(users.map((user) => [user.client_id, user]));

  const outcome: GrantOutcome = { credentials: [], conflicts: [] };

  for (const client of clients) {
    const user = byClient.get(client.id);
    if (user && user.password_hash) continue;

    const credential = await grantForCandidate(client);
    if (credential) outcome.credentials.push(credential);
    else outcome.conflicts.push({ clientId: client.id, name: client.name, email: client.email });
  }

  return outcome;
}

/* -------------------------------------------------------------------------
   Acoes sobre um usuario
   ------------------------------------------------------------------------- */

/**
 * Nova senha temporaria.
 *
 * O primeiro acesso volta a ser obrigatorio e todas as sessoes caem, na
 * mesma transacao da funcao `cmd_set_temp_password`.
 */
export async function resetPassword(userId: string): Promise<GeneratedCredential> {
  const user = await requireUser(userId);
  const password = generateTempPassword();

  await callFunction<number>('cmd_set_temp_password', {
    p_user_id: user.id,
    p_password_hash: await hashPassword(password),
  });

  return { userId: user.id, name: user.name, email: user.email, password };
}

export async function setUserActive(userId: string, active: boolean): Promise<void> {
  const user = await requireUser(userId);

  await updateRows<UserRow>(TABLES.users, { id: `eq.${user.id}` }, { is_active: active }, 'id');
  if (!active) await revokeUserSessions(user.id);
}

export async function revokeUserSessions(userId: string): Promise<number> {
  const count = await callFunction<number>('cmd_revoke_user_sessions', { p_user_id: userId });
  return typeof count === 'number' ? count : 0;
}

/* -------------------------------------------------------------------------
   Sincronizacao com o cadastro do candidato
   ------------------------------------------------------------------------- */

/**
 * Mantem o login igual ao cadastro do candidato.
 *
 * Se o novo e-mail ja for de outro usuario, nada e alterado e o erro sobe
 * com a mensagem padrao. Trocar o e-mail derruba as sessoes antigas.
 */
export async function syncCandidateLogin(
  clientId: string,
  patch: { name?: string; email?: string },
): Promise<void> {
  const user = await findUserByClient(clientId);
  if (!user) return;

  const changes: Record<string, string> = {};
  const email = patch.email?.trim().toLowerCase();
  const name = patch.name?.trim();

  if (email && email !== user.email) {
    const conflict = await findUserByEmail(email);
    if (conflict && conflict.id !== user.id) throw emailConflict();
    changes.email = email;
  }
  if (name && name !== user.name) changes.name = name;
  if (Object.keys(changes).length === 0) return;

  await updateRows<UserRow>(TABLES.users, { id: `eq.${user.id}` }, changes, 'id');
  if (changes.email) await revokeUserSessions(user.id);
}

/**
 * Confere o conflito antes de qualquer gravacao no cadastro do candidato.
 * `clientId` nulo significa cadastro novo, que ainda nao tem vinculo.
 */
export async function assertEmailAvailable(
  clientId: string | null,
  email: string,
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const conflict = await findUserByEmail(normalized);
  if (!conflict) return;
  if (conflict.client_id === clientId) return;
  throw emailConflict();
}

/**
 * Encerra o acesso do candidato antes da exclusao do cadastro.
 * A linha em `cmd_users` sai junto pela cascata do banco.
 */
export async function disableCandidateAccess(clientId: string): Promise<void> {
  const user = await findUserByClient(clientId);
  if (!user) return;

  await updateRows<UserRow>(TABLES.users, { id: `eq.${user.id}` }, { is_active: false }, 'id');
  await revokeUserSessions(user.id);
}

/** Impede que o ADMIN desative ou derrube a propria conta sem querer. */
export function assertNotSelf(currentUserId: string, userId: string): void {
  if (currentUserId === userId) {
    throw badRequest('Esta ação não pode ser aplicada à sua própria conta.');
  }
}
