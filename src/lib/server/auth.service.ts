import 'server-only';
import { cookies } from 'next/headers';
import type { Role, SessionUser } from '@/lib/types';
import { verifyPassword } from '@/lib/auth/password';
import { createToken, hashToken } from '@/lib/auth/tokens';
import {
  GENERIC_LOGIN_ERROR,
  LOGIN_LOCK_MINUTES,
  MAX_LOGIN_ATTEMPTS,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from '@/lib/auth/constants';
import { TABLES, type SessionRow, type UserRow } from '@/lib/supabase/tables';
import { deleteRows, insertOne, selectOne, updateRows } from '@/lib/supabase/rest';

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

function toSessionUser(row: Pick<UserRow, 'id' | 'name' | 'email' | 'role'>): SessionUser {
  return { id: row.id, name: row.name, email: row.email, role: row.role as Role };
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
  user: Pick<UserRow, 'id' | 'name' | 'email' | 'role' | 'is_active'> | null;
}

/** Resolve o token bruto do cookie para o usuario da sessao. */
export async function resolveSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;

  const row = await selectOne<SessionJoinRow>(TABLES.sessions, {
    select: `id,expires_at,revoked_at,user:${TABLES.users}(id,name,email,role,is_active)`,
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
