import 'server-only';
import { cookies } from 'next/headers';
import type { Role, SessionUser } from '@/lib/types';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createToken, hashToken } from '@/lib/auth/tokens';
import {
  GENERIC_LOGIN_ERROR,
  LOGIN_LOCK_MINUTES,
  MAX_LOGIN_ATTEMPTS,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from '@/lib/auth/constants';
import { TABLES, type SessionRow, type UserRow } from '@/lib/supabase/tables';
import { callFunction, deleteRows, insertOne, selectOne, updateRows } from '@/lib/supabase/rest';

/**
 * Autenticacao propria do CMD.
 *
 * Nao usa Supabase Authentication em nenhum ponto: nada de `supabase.auth`,
 * `auth.users`, Auth.js ou politicas com `auth.uid()`. Usuarios, senhas e
 * sessoes vivem em `cmd_users` e `cmd_sessions`, consultadas apenas aqui,
 * no servidor, com a chave secreta.
 */

export interface LoginOutcome {
  user: SessionUser | null;
  /** Token bruto da sessao. So existe quando o login foi aceito. */
  token: string | null;
  message: string | null;
  /** Bloqueio temporario por tentativas repetidas. */
  throttled: boolean;
}

type SessionColumns = Pick<
  UserRow,
  'id' | 'name' | 'email' | 'role' | 'client_id' | 'member_id' | 'must_change_password'
>;

function toSessionUser(row: SessionColumns): SessionUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as Role,
    // O vinculo vem sempre do banco: o navegador nunca escolhe a operacao
    // nem o integrante. ADMIN nao pertence a nenhuma operacao.
    candidateId: row.role === 'ADMIN' ? null : row.client_id,
    memberId: row.role === 'EQUIPE' ? row.member_id : null,
    mustChangePassword: row.must_change_password === true,
  };
}

function isLocked(row: UserRow): boolean {
  return row.locked_until !== null && new Date(row.locked_until).getTime() > Date.now();
}

/** Custo fixo aplicado quando o e-mail nao existe, para nao vazar a diferenca. */
async function burnTime(password: string): Promise<void> {
  await verifyPassword(password, null);
}

async function registerFailure(row: UserRow): Promise<void> {
  const attempts = row.failed_attempts + 1;
  const locked =
    attempts >= MAX_LOGIN_ATTEMPTS
      ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60_000).toISOString()
      : null;

  await updateRows<UserRow>(
    TABLES.users,
    { id: `eq.${row.id}` },
    { failed_attempts: attempts, locked_until: locked },
    'id',
  );
}

/**
 * Confere as credenciais e, quando validas, abre uma sessao.
 * O token devolvido e o valor original: o banco guarda apenas o hash.
 */
export async function login(email: string, password: string): Promise<LoginOutcome> {
  const normalized = email.trim().toLowerCase();

  const row = await selectOne<UserRow>(TABLES.users, {
    select: '*',
    filters: { email: `eq.${normalized}` },
  });

  if (!row || !row.is_active) {
    await burnTime(password);
    return { user: null, token: null, message: GENERIC_LOGIN_ERROR, throttled: false };
  }

  if (isLocked(row)) {
    await burnTime(password);
    return {
      user: null,
      token: null,
      message: `Muitas tentativas. Tente novamente em ${LOGIN_LOCK_MINUTES} minutos.`,
      throttled: true,
    };
  }

  const matches = await verifyPassword(password, row.password_hash);
  if (!matches) {
    await registerFailure(row);
    return { user: null, token: null, message: GENERIC_LOGIN_ERROR, throttled: false };
  }

  const token = createToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();

  await insertOne<SessionRow>(
    TABLES.sessions,
    { user_id: row.id, token_hash: hashToken(token), expires_at: expiresAt },
    'id',
  );

  await updateRows<UserRow>(
    TABLES.users,
    { id: `eq.${row.id}` },
    { failed_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() },
    'id',
  );

  return { user: toSessionUser(row), token, message: null, throttled: false };
}

interface SessionJoinRow extends SessionRow {
  user: (SessionColumns & Pick<UserRow, 'is_active'>) | null;
}

/** Resolve o token bruto do cookie para o usuario da sessao. */
export async function resolveSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;

  const row = await selectOne<SessionJoinRow>(TABLES.sessions, {
    select:
      `id,expires_at,revoked_at,` +
      `user:${TABLES.users}(id,name,email,role,client_id,member_id,must_change_password,is_active)`,
    filters: { token_hash: `eq.${hashToken(token)}` },
  });

  if (!row || !row.user || !row.user.is_active) return null;
  if (row.revoked_at !== null) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  return toSessionUser(row.user);
}

/** Encerra a sessao correspondente ao token. */
export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await updateRows<SessionRow>(
    TABLES.sessions,
    { token_hash: `eq.${hashToken(token)}` },
    { revoked_at: new Date().toISOString() },
    'id',
  );
}

/** Remove sessoes expiradas ou revogadas. Chamado no logout. */
export async function purgeExpiredSessions(): Promise<void> {
  await deleteRows(TABLES.sessions, { expires_at: `lt.${new Date().toISOString()}` }).catch(
    () => [],
  );
}

/** Le a sessao atual a partir do cookie da requisicao. */
export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value);
}

export interface ChangePasswordOutcome {
  ok: boolean;
  /** Mensagem para a tela. Nunca revela detalhe interno. */
  message: string | null;
}

/**
 * Troca a senha do usuario da sessao.
 *
 * O identificador vem sempre da sessao autenticada, nunca do formulario.
 * A gravacao e a revogacao das sessoes acontecem em uma transacao so, na
 * funcao `cmd_change_password`. Nenhuma senha ou hash e registrado em log.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordOutcome> {
  const row = await selectOne<Pick<UserRow, 'id' | 'password_hash' | 'is_active'>>(TABLES.users, {
    select: 'id,password_hash,is_active',
    filters: { id: `eq.${userId}` },
  });

  if (!row || !row.is_active) {
    return { ok: false, message: 'Sessão expirada. Entre novamente.' };
  }

  const matches = await verifyPassword(currentPassword, row.password_hash);
  if (!matches) {
    return { ok: false, message: 'Senha atual incorreta.' };
  }

  // Confere tambem contra o hash guardado: senhas diferentes no formulario
  // ainda podem ser a mesma senha na pratica.
  if (await verifyPassword(newPassword, row.password_hash)) {
    return { ok: false, message: 'A nova senha precisa ser diferente da atual.' };
  }

  await callFunction<number>('cmd_change_password', {
    p_user_id: userId,
    p_password_hash: await hashPassword(newPassword),
  });

  return { ok: true, message: null };
}

/**
 * Conclui o primeiro acesso do candidato.
 *
 * A senha temporaria e substituida, a obrigacao de troca cai e todas as
 * outras sessoes sao revogadas na mesma transacao: fica valendo apenas a
 * sessao que fez a troca, identificada pelo hash do token do cookie.
 */
export async function completeFirstAccess(
  userId: string,
  newPassword: string,
  sessionToken: string | undefined,
): Promise<ChangePasswordOutcome> {
  if (!sessionToken) return { ok: false, message: 'Sessão expirada. Entre novamente.' };

  const row = await selectOne<
    Pick<UserRow, 'id' | 'password_hash' | 'is_active' | 'must_change_password'>
  >(TABLES.users, {
    select: 'id,password_hash,is_active,must_change_password',
    filters: { id: `eq.${userId}` },
  });

  if (!row || !row.is_active) return { ok: false, message: 'Sessão expirada. Entre novamente.' };
  if (!row.must_change_password) {
    return { ok: false, message: 'Esta conta já definiu a senha definitiva.' };
  }

  if (await verifyPassword(newPassword, row.password_hash)) {
    return { ok: false, message: 'A nova senha precisa ser diferente da senha temporária.' };
  }

  await callFunction<number>('cmd_complete_first_access', {
    p_user_id: userId,
    p_password_hash: await hashPassword(newPassword),
    p_keep_token_hash: hashToken(sessionToken),
  });

  return { ok: true, message: null };
}
