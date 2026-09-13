import 'server-only';
import { cookies, headers } from 'next/headers';
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
import { isAdminHost } from '@/lib/domain/hosts';
import { TABLES, type SessionRow, type UserRow } from '@/lib/supabase/tables';
import { callFunction, deleteRows, insertOne, selectOne, updateRows } from '@/lib/supabase/rest';
import { signedUrl } from '@/lib/supabase/storage';
import { ADMIN_DEVICE_COOKIE, checkAdminDevice } from './admin-device';

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
  | 'id'
  | 'name'
  | 'email'
  | 'role'
  | 'client_id'
  | 'member_id'
  | 'team_person_id'
  | 'must_change_password'
>;

/** Colunas da sessao, na ordem usada por todas as consultas deste arquivo. */
const SESSION_COLUMNS =
  'id,name,email,role,client_id,member_id,team_person_id,must_change_password';

function toSessionUser(row: SessionColumns, photo: string | null = null): SessionUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    photo,
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
 *
 * E-mail e senha sao exclusivos do ADMIN geral. O Administrador do time e o
 * membro da equipe entram pelo link do time + telefone: mesmo que exista um
 * e-mail historico gravado na linha deles, esta porta nao abre — e a recusa
 * usa a MESMA mensagem de credencial invalida, sem revelar o motivo.
 */
export async function login(email: string, password: string): Promise<LoginOutcome> {
  const normalized = email.trim().toLowerCase();

  const row = await selectOne<UserRow>(TABLES.users, {
    select: '*',
    filters: { email: `eq.${normalized}` },
  });

  if (!row || !row.is_active || row.role !== 'ADMIN') {
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

/**
 * Sessao de quem entra por link do time + telefone: alem de valida, ela
 * precisa continuar vindo do aparelho autorizado.
 *
 * Vale para o Administrador do time e para o membro da equipe. O ADMIN geral
 * fica de fora: ele entra por e-mail e senha e nao tem aparelho vinculado.
 */
function usesTrustedDevice(user: SessionColumns): boolean {
  if (user.role === 'CANDIDATE') return user.team_person_id !== null;
  return user.role === 'EQUIPE' && user.member_id !== null;
}

interface SessionJoinRow extends SessionRow {
  user:
    | (SessionColumns &
        Pick<UserRow, 'is_active'> & {
          /** Administrador do time correspondente, so para a foto do menu. */
          team_person: { photo_path: string | null } | null;
        })
    | null;
}

/**
 * Foto do integrante, quando a sessao e do perfil EQUIPE.
 *
 * Lida em uma consulta propria, e nao embutida na consulta da sessao: entre
 * `cmd_users` e `cmd_members` existem DOIS caminhos — o usuario aponta o
 * integrante e o integrante aponta quem o cadastrou. Um vinculo embutido
 * ficaria ambiguo, a consulta inteira falharia e NENHUMA sessao resolveria,
 * em nenhum perfil. O Administrador do time nao tem esse problema: ate
 * `cmd_team_people` existe um caminho so.
 */
async function memberPhoto(user: SessionColumns): Promise<string | null> {
  if (user.role !== 'EQUIPE' || !user.member_id) return null;

  const member = await selectOne<{ photo_path: string | null }>(TABLES.members, {
    select: 'photo_path',
    filters: { id: `eq.${user.member_id}` },
  });
  return signedUrl(member?.photo_path ?? null);
}

/**
 * Resolve o token bruto do cookie para o usuario da sessao.
 *
 * Em quem entra por link + telefone — Administrador do time e membro da
 * equipe — a conferencia nao para na sessao: o aparelho precisa continuar
 * ativo, a credencial do cookie precisa bater com o hash guardado e o
 * aparelho precisa ser do MESMO usuario. Qualquer divergencia revoga a
 * sessao ali mesmo e devolve `null`, o que nega paginas e APIs e leva de
 * volta a tela de acesso.
 */
export async function resolveSession(
  token: string | undefined,
  deviceToken?: string | undefined,
): Promise<SessionUser | null> {
  if (!token) return null;

  const row = await selectOne<SessionJoinRow>(TABLES.sessions, {
    select:
      `id,expires_at,revoked_at,admin_device_id,` +
      `user:${TABLES.users}(${SESSION_COLUMNS},is_active,` +
      `team_person:${TABLES.teamPeople}(photo_path))`,
    filters: { token_hash: `eq.${hashToken(token)}` },
  });

  if (!row || !row.user || !row.user.is_active) return null;
  if (row.revoked_at !== null) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  if (usesTrustedDevice(row.user)) {
    const autorizado = await checkAdminDevice(row.user.id, row.admin_device_id, deviceToken);
    if (!autorizado) {
      await revokeSession(token);
      return null;
    }
  }

  // Foto do cadastro correspondente: do Administrador do time, que ja veio
  // junto, ou do proprio integrante, lido a parte. No ADMIN geral nada e
  // consultado e nenhuma assinatura e pedida ao Storage.
  const photo = row.user.team_person
    ? await signedUrl(row.user.team_person.photo_path)
    : await memberPhoto(row.user);

  return toSessionUser(row.user, photo);
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

/**
 * Le a sessao atual a partir dos cookies da requisicao.
 *
 * Aqui tambem mora a regra do ENDERECO EXCLUSIVO DO ADMIN: naquele endereco,
 * uma sessao que nao seja do ADMIN geral simplesmente nao existe. A conta
 * continua valendo no endereco dela — o que muda e que este endereco nao
 * atende esse perfil.
 *
 * A conferencia fica NESTA funcao, e nao em cada tela, porque e por ela que
 * passam o layout do painel, todas as paginas e todas as rotas de API: uma
 * regra escrita em um lugar so nao tem como ser esquecida na proxima rota.
 * O `proxy.ts` nao poderia fazer isso — ele roda antes da aplicacao, le
 * apenas o cookie opaco e nao sabe de quem ele e.
 *
 * Forjar o cabecalho `Host` nao abre nada: a regra so RESTRINGE. Chegar ao
 * endereco do ADMIN sem ser ADMIN fecha a porta, e dizer-se em outro
 * endereco devolve exatamente o acesso que a conta ja tinha.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const user = await resolveSession(
    store.get(SESSION_COOKIE)?.value,
    store.get(ADMIN_DEVICE_COOKIE)?.value,
  );
  if (!user) return null;

  if (user.role !== 'ADMIN' && isAdminHost((await headers()).get('host'))) return null;

  return user;
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
 * Conclui o primeiro acesso do time.
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
