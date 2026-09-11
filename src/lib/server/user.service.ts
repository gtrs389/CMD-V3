import 'server-only';
import type {
  AccessStatus,
  CandidateWithoutAccess,
  GeneratedCredential,
  MemberWithoutAccess,
  Recruiter,
  Role,
  SystemUser,
} from '@/lib/types';
import { hashPassword } from '@/lib/auth/password';
import { generateTempPassword } from '@/lib/auth/temp-password';
import { createInviteToken } from '@/lib/auth/tokens';
import { isValidEmail, normalizeEmail } from '@/lib/utils/email';
import { TABLES, type ClientRow, type MemberRow, type UserRow } from '@/lib/supabase/tables';
import {
  callFunction,
  inFilter,
  insertOne,
  selectOne,
  selectRows,
  updateRows,
} from '@/lib/supabase/rest';
import { signedUrls } from '@/lib/supabase/storage';
import { ensurePersonalInvite } from './invite.service';
import { ApiError, badRequest, notFound } from './http';

/**
 * Usuarios do sistema: ADMINs, candidatos e integrantes da equipe.
 *
 * Todo integrante cadastrado por um link passa a ter acesso proprio ao CMD,
 * com um link pessoal de recrutamento. Integrantes anteriores ao campo de
 * e-mail continuam sem acesso ate que o endereco seja informado.
 *
 * Senha em texto puro nunca e gravada nem registrada. A geracao devolve o
 * valor uma unica vez, na resposta da acao; no banco fica apenas o hash
 * scrypt calculado aqui.
 */

const USER_COLUMNS =
  'id,name,email,role,client_id,member_id,is_active,must_change_password,password_hash,last_login_at,created_at';

type UserColumns = Pick<
  UserRow,
  | 'id'
  | 'name'
  | 'email'
  | 'role'
  | 'client_id'
  | 'member_id'
  | 'is_active'
  | 'must_change_password'
  | 'password_hash'
  | 'last_login_at'
  | 'created_at'
>;

/** E-mail ja usado por outro usuario. Mensagem unica em todo o sistema. */
export const EMAIL_IN_USE = 'E-mail já utilizado por outro usuário.';

/** Integrante sem e-mail: nao ha como criar acesso. */
export const EMAIL_REQUIRED = 'E-mail necessário para criar o acesso.';

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
    filters: { email: `eq.${normalizeEmail(email)}` },
  });
}

async function findUserByClient(clientId: string): Promise<UserColumns | null> {
  return selectOne<UserColumns>(TABLES.users, {
    select: USER_COLUMNS,
    filters: { client_id: `eq.${clientId}`, role: 'eq.CANDIDATE' },
  });
}

async function findUserByMember(memberId: string): Promise<UserColumns | null> {
  return selectOne<UserColumns>(TABLES.users, {
    select: USER_COLUMNS,
    filters: { member_id: `eq.${memberId}` },
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

/** Origem do cadastro a partir da linha do integrante, sem foto. */
function recruiterOf(row: Pick<MemberRow, 'recruited_by_user_id' | 'recruited_by_name' | 'recruited_by_role'>): Recruiter | null {
  if (!row.recruited_by_name || !row.recruited_by_role) return null;
  return {
    userId: row.recruited_by_user_id,
    name: row.recruited_by_name,
    role: row.recruited_by_role,
    photo: null,
  };
}

/* -------------------------------------------------------------------------
   Listagem
   ------------------------------------------------------------------------- */

export async function listSystemUsers(currentUserId: string): Promise<SystemUser[]> {
  const rows = await selectRows<UserColumns>(TABLES.users, {
    select: USER_COLUMNS,
    filters: { role: 'in.(ADMIN,CANDIDATE,EQUIPE)' },
    order: 'created_at.asc',
  });
  if (rows.length === 0) return [];

  const clientIds = [...new Set(rows.map((row) => row.client_id).filter((id): id is string => Boolean(id)))];
  const memberIds = rows.map((row) => row.member_id).filter((id): id is string => Boolean(id));

  const [clients, members] = await Promise.all([
    clientIds.length
      ? selectRows<Pick<ClientRow, 'id' | 'name' | 'photo_path'>>(TABLES.clients, {
          select: 'id,name,photo_path',
          filters: { id: inFilter(clientIds) },
        })
      : Promise.resolve([]),
    memberIds.length
      ? selectRows<
          Pick<
            MemberRow,
            'id' | 'photo_path' | 'recruited_by_user_id' | 'recruited_by_name' | 'recruited_by_role'
          >
        >(TABLES.members, {
          select: 'id,photo_path,recruited_by_user_id,recruited_by_name,recruited_by_role',
          filters: { id: inFilter(memberIds) },
        })
      : Promise.resolve([]),
  ]);

  const photos = await signedUrls(clients.map((client) => client.photo_path));
  const byId = new Map(
    clients.map((client, index) => [
      client.id,
      { id: client.id, name: client.name, photo: photos[index] ?? null },
    ]),
  );
  const memberById = new Map(members.map((member) => [member.id, member]));

  return rows.map((row) => {
    const member = row.member_id ? memberById.get(row.member_id) : undefined;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role as Role,
      status: accessStatus(row),
      candidate: row.client_id ? (byId.get(row.client_id) ?? null) : null,
      memberId: row.member_id,
      recruitedBy: member ? recruiterOf(member) : null,
      lastLoginAt: row.last_login_at,
      mustChangePassword: row.must_change_password,
      createdAt: row.created_at,
      self: row.id === currentUserId,
    };
  });
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
    filters: { client_id: inFilter(clients.map((client) => client.id)), role: 'eq.CANDIDATE' },
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

/**
 * Integrantes que ainda nao possuem usuario.
 *
 * Com e-mail valido, o ADMIN gera o acesso em Configuracoes. Sem e-mail o
 * estado fica em "E-mail necessário" e nenhuma senha e criada.
 */
export async function listMembersWithoutAccess(): Promise<MemberWithoutAccess[]> {
  const members = await selectRows<
    Pick<
      MemberRow,
      | 'id'
      | 'client_id'
      | 'name'
      | 'email'
      | 'photo_path'
      | 'recruited_by_user_id'
      | 'recruited_by_name'
      | 'recruited_by_role'
    >
  >(TABLES.members, {
    select:
      'id,client_id,name,email,photo_path,recruited_by_user_id,recruited_by_name,recruited_by_role',
    order: 'created_at.asc',
  });
  if (members.length === 0) return [];

  const users = await selectRows<Pick<UserColumns, 'member_id'>>(TABLES.users, {
    select: 'member_id',
    filters: { member_id: inFilter(members.map((member) => member.id)) },
  });
  const comAcesso = new Set(users.map((user) => user.member_id));

  const pendentes = members.filter((member) => !comAcesso.has(member.id));
  if (pendentes.length === 0) return [];

  const clients = await selectRows<Pick<ClientRow, 'id' | 'name'>>(TABLES.clients, {
    select: 'id,name',
    filters: { id: inFilter([...new Set(pendentes.map((member) => member.client_id))]) },
  });
  const clientName = new Map(clients.map((client) => [client.id, client.name]));

  const photos = await signedUrls(pendentes.map((member) => member.photo_path));

  return pendentes.map((member, index) => ({
    memberId: member.id,
    clientId: member.client_id,
    candidateName: clientName.get(member.client_id) ?? '--',
    name: member.name,
    email: member.email,
    photo: photos[index] ?? null,
    recruitedBy: recruiterOf(member),
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
 * Cria ou renova a senha temporaria de um candidato, junto do link pessoal.
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
    await ensurePersonalInvite(existing.id, client.id);
    return { userId: existing.id, name: existing.name, email: existing.email, password };
  }

  const email = normalizeEmail(client.email);
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

  // O link pessoal do candidato nasce junto com o acesso dele.
  await ensurePersonalInvite(row.id, client.id);

  return { userId: row.id, name: row.name, email: row.email, password };
}

/** Acesso de um candidato, criado logo apos o cadastro. */
export async function createCandidateAccess(
  client: CandidateSeed,
): Promise<GeneratedCredential | null> {
  return grantForCandidate(client);
}

/* -------------------------------------------------------------------------
   Acesso do integrante (perfil EQUIPE)
   ------------------------------------------------------------------------- */

export interface TeamSeed {
  clientId: string;
  memberId: string;
  name: string;
  email: string;
}

/**
 * Conferencia previa do e-mail do integrante.
 *
 * Roda ANTES de gravar qualquer coisa: se o endereco ja pertence a um
 * usuario ou a outro integrante, o cadastro para aqui e nenhum dado orfao e
 * criado.
 */
export async function assertMemberEmailFree(email: string, memberId?: string): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) throw badRequest('Informe um e-mail válido.');

  const user = await findUserByEmail(normalized);
  if (user && user.member_id !== (memberId ?? null)) throw emailConflict();

  const member = await selectOne<Pick<MemberRow, 'id'>>(TABLES.members, {
    select: 'id',
    filters: { email: `eq.${normalized}` },
  });
  if (member && member.id !== memberId) throw emailConflict();
}

/**
 * Acesso EQUIPE do integrante: usuario e link pessoal em uma transacao so.
 *
 * A funcao `cmd_create_team_access` grava os dois juntos: nunca sobra
 * usuario sem link nem link sem usuario. O token vai pronto daqui e nao e
 * registrado em log.
 */
export async function createTeamAccess(seed: TeamSeed): Promise<GeneratedCredential> {
  const email = normalizeEmail(seed.email);
  const password = generateTempPassword();

  const userId = await callFunction<string>('cmd_create_team_access', {
    p_client_id: seed.clientId,
    p_member_id: seed.memberId,
    p_name: seed.name.trim().slice(0, 120),
    p_email: email,
    p_password_hash: await hashPassword(password),
    p_token: createInviteToken(),
  });

  return { userId, name: seed.name, email, password };
}

/**
 * Acesso pendente de um integrante antigo.
 *
 * O usuario existe, mas sem senha utilizavel: o ADMIN gera a senha em
 * Configuracoes quando quiser.
 */
export async function createPendingTeamAccess(seed: TeamSeed): Promise<string> {
  return callFunction<string>('cmd_create_team_access', {
    p_client_id: seed.clientId,
    p_member_id: seed.memberId,
    p_name: seed.name.trim().slice(0, 120),
    p_email: normalizeEmail(seed.email),
    p_password_hash: null,
    p_token: createInviteToken(),
  });
}

export interface GrantOutcome {
  credentials: GeneratedCredential[];
  /** Ignorados porque o e-mail pertence a outro usuario ou nao existe. */
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
 * Gera o acesso de um integrante, a pedido do ADMIN.
 *
 * Sem e-mail valido nada e criado: o integrante continua em
 * "E-mail necessário".
 */
export async function grantMemberAccess(memberId: string): Promise<GrantOutcome> {
  const member = await selectOne<Pick<MemberRow, 'id' | 'client_id' | 'name' | 'email'>>(
    TABLES.members,
    { select: 'id,client_id,name,email', filters: { id: `eq.${memberId}` } },
  );
  if (!member) throw notFound('Integrante não encontrado.');

  if (!member.email || !isValidEmail(member.email)) {
    throw badRequest(EMAIL_REQUIRED);
  }

  const existing = await findUserByMember(member.id);
  if (existing) {
    const credential = await resetPassword(existing.id);
    await updateRows<UserRow>(TABLES.users, { id: `eq.${existing.id}` }, { is_active: true }, 'id');
    await ensurePersonalInvite(existing.id, member.client_id);
    return { credentials: [credential], conflicts: [] };
  }

  const conflict = await findUserByEmail(member.email);
  if (conflict) {
    return {
      credentials: [],
      conflicts: [{ clientId: member.client_id, name: member.name, email: member.email }],
    };
  }

  const credential = await createTeamAccess({
    clientId: member.client_id,
    memberId: member.id,
    name: member.name,
    email: member.email,
  });
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
    filters: { client_id: inFilter(clients.map((client) => client.id)), role: 'eq.CANDIDATE' },
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
  const email = patch.email ? normalizeEmail(patch.email) : undefined;
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
 * Mantem o login do integrante igual ao cadastro dele.
 *
 * Vale para nome e e-mail. Trocar o e-mail derruba as sessoes antigas.
 */
export async function syncMemberLogin(
  memberId: string,
  patch: { name?: string; email?: string | null },
): Promise<void> {
  const user = await findUserByMember(memberId);
  if (!user) return;

  const changes: Record<string, string> = {};
  const email = patch.email ? normalizeEmail(patch.email) : undefined;
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
  const normalized = normalizeEmail(email);
  const conflict = await findUserByEmail(normalized);
  if (conflict && conflict.client_id !== clientId) throw emailConflict();

  // O e-mail tambem e a credencial dos integrantes: nao pode colidir.
  const member = await selectOne<Pick<MemberRow, 'id'>>(TABLES.members, {
    select: 'id',
    filters: { email: `eq.${normalized}` },
  });
  if (member) throw emailConflict();
}

/**
 * Encerra o acesso do candidato antes da exclusao do cadastro.
 * A linha em `cmd_users` sai junto pela cascata do banco.
 */
export async function disableCandidateAccess(clientId: string): Promise<void> {
  const users = await selectRows<Pick<UserColumns, 'id'>>(TABLES.users, {
    select: 'id',
    filters: { client_id: `eq.${clientId}` },
  });

  for (const user of users) {
    await updateRows<UserRow>(TABLES.users, { id: `eq.${user.id}` }, { is_active: false }, 'id');
    await revokeUserSessions(user.id);
  }
}

/** Impede que o ADMIN desative ou derrube a propria conta sem querer. */
export function assertNotSelf(currentUserId: string, userId: string): void {
  if (currentUserId === userId) {
    throw badRequest('Esta ação não pode ser aplicada à sua própria conta.');
  }
}
