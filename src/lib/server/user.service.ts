import 'server-only';
import type {
  AccessStatus,
  CandidateWithoutAdmins,
  GeneratedCredential,
  MemberWithoutAccess,
  Recruiter,
  Role,
  SystemUser,
} from '@/lib/types';
import { PHONE_IN_USE } from '@/lib/types';
import { hashPassword } from '@/lib/auth/password';
import { generateTempPassword } from '@/lib/auth/temp-password';
import { normalizePhone } from '@/lib/utils/phone';
import {
  TABLES,
  type ClientRow,
  type MemberRow,
  type TeamPersonRow,
  type UserRow,
} from '@/lib/supabase/tables';
import {
  callFunction,
  inFilter,
  insertOne,
  selectOne,
  selectRows,
  updateRows,
} from '@/lib/supabase/rest';
import { signedUrls } from '@/lib/supabase/storage';
import { activeAdminDevices, releaseAdminDevice } from './admin-device';
import { ensurePersonalInvite } from './invite.service';
import { ApiError, badRequest, notFound } from './http';

/**
 * Usuarios do sistema: ADMINs, administradores de time e integrantes da
 * equipe.
 *
 * Somente o ADMIN geral tem e-mail e senha. Os dois outros perfis entram
 * pelo par LINK DO TIME + TELEFONE (ver `team-access.service.ts`):
 *
 *   Administrador do time (CANDIDATE) -> telefone do cadastro em
 *                                        "Administradores do time";
 *   Membro da equipe (EQUIPE)         -> telefone do proprio cadastro.
 *
 * O telefone nunca e senha: sozinho ele nao autentica ninguem. Dentro de um
 * mesmo time um telefone ativo identifica UMA pessoa, contando os dois
 * perfis juntos; em times diferentes o mesmo numero pode existir, porque o
 * link diz primeiro de qual time se trata.
 *
 * Senha em texto puro nunca e gravada nem registrada. A geracao devolve o
 * valor uma unica vez, na resposta da acao; no banco fica apenas o hash
 * scrypt calculado aqui, e ela existe apenas para o ADMIN geral.
 */

const USER_COLUMNS =
  'id,name,email,phone,role,client_id,member_id,team_person_id,is_active,' +
  'must_change_password,password_hash,last_login_at,created_at';

type UserColumns = Pick<
  UserRow,
  | 'id'
  | 'name'
  | 'email'
  | 'phone'
  | 'role'
  | 'client_id'
  | 'member_id'
  | 'team_person_id'
  | 'is_active'
  | 'must_change_password'
  | 'password_hash'
  | 'last_login_at'
  | 'created_at'
>;

/**
 * Recusa por telefone repetido.
 *
 * A mensagem vive em `@/lib/types` porque a tela publica tambem a usa: ela
 * aparece no proprio campo Telefone quando o cadastro e recusado.
 */
export function phoneConflict(): ApiError {
  return new ApiError(409, PHONE_IN_USE);
}

/** Perfis que entram por link do time + telefone, com aparelho vinculado. */
function usesPhoneAccess(
  row: Pick<UserColumns, 'role'> & { team_person_id?: string | null },
): boolean {
  return row.role === 'EQUIPE' || Boolean(row.team_person_id);
}

/**
 * Estado do acesso.
 *
 * Quem entra por link + telefone nao tem senha: para essas pessoas o acesso
 * esta ativo enquanto o usuario estiver ativo e tiver telefone. Sem telefone
 * nao ha como identificar a pessoa no link do time, e o estado fica em
 * "Telefone necessário". Somente o ADMIN geral depende de senha.
 */
export function accessStatus(
  row: Pick<UserColumns, 'is_active' | 'password_hash' | 'role' | 'phone'> & {
    team_person_id?: string | null;
  },
): AccessStatus {
  if (!row.is_active) return 'DISABLED';
  if (usesPhoneAccess(row)) return row.phone ? 'ACTIVE' : 'NO_PHONE';
  return row.password_hash ? 'ACTIVE' : 'PENDING';
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
  const personIds = rows
    .map((row) => row.team_person_id)
    .filter((id): id is string => Boolean(id));

  const [clients, members, people] = await Promise.all([
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
    personIds.length
      ? selectRows<Pick<TeamPersonRow, 'id' | 'photo_path'>>(TABLES.teamPeople, {
          select: 'id,photo_path',
          filters: { id: inFilter(personIds) },
        })
      : Promise.resolve([]),
  ]);

  const [photos, personPhotos, memberPhotos, devices] = await Promise.all([
    signedUrls(clients.map((client) => client.photo_path)),
    signedUrls(people.map((person) => person.photo_path)),
    signedUrls(members.map((member) => member.photo_path)),
    // Aparelho autorizado de quem entra por link + telefone: Administrador do
    // time e membro da equipe. Somente auditoria: nenhum hash de credencial
    // ou de IP sai daqui.
    activeAdminDevices(rows.filter(usesPhoneAccess).map((row) => row.id)),
  ]);
  const byId = new Map(
    clients.map((client, index) => [
      client.id,
      { id: client.id, name: client.name, photo: photos[index] ?? null },
    ]),
  );
  const memberById = new Map(members.map((member) => [member.id, member]));
  const personPhotoById = new Map(
    people.map((person, index) => [person.id, personPhotos[index] ?? null]),
  );
  const memberPhotoById = new Map(
    members.map((member, index) => [member.id, memberPhotos[index] ?? null]),
  );

  return rows.map((row) => {
    const member = row.member_id ? memberById.get(row.member_id) : undefined;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      photo: row.team_person_id
        ? (personPhotoById.get(row.team_person_id) ?? null)
        : row.member_id
          ? (memberPhotoById.get(row.member_id) ?? null)
          : null,
      role: row.role as Role,
      status: accessStatus(row),
      candidate: row.client_id ? (byId.get(row.client_id) ?? null) : null,
      memberId: row.member_id,
      teamPersonId: row.team_person_id,
      device: usesPhoneAccess(row) ? (devices.get(row.id) ?? null) : null,
      recruitedBy: member ? recruiterOf(member) : null,
      lastLoginAt: row.last_login_at,
      mustChangePassword: row.must_change_password,
      createdAt: row.created_at,
      self: row.id === currentUserId,
    };
  });
}

/**
 * Times que ainda nao possuem nenhum administrador.
 *
 * Sem administrador nao existe acesso ao time: quem entra no painel do time
 * e sempre uma pessoa cadastrada em "Administradores do time". Eles aparecem
 * em Configuracoes apenas como aviso, sem senha a gerar.
 */
export async function listTeamsWithoutAdmins(): Promise<CandidateWithoutAdmins[]> {
  const clients = await selectRows<Pick<ClientRow, 'id' | 'name' | 'photo_path'>>(TABLES.clients, {
    select: 'id,name,photo_path',
    order: 'created_at.asc',
  });
  if (clients.length === 0) return [];

  const people = await selectRows<Pick<TeamPersonRow, 'client_id'>>(TABLES.teamPeople, {
    select: 'client_id',
    filters: { client_id: inFilter(clients.map((client) => client.id)) },
  });
  const comAdministrador = new Set(people.map((person) => person.client_id));

  const pendentes = clients.filter((client) => !comAdministrador.has(client.id));
  const photos = await signedUrls(pendentes.map((client) => client.photo_path));

  return pendentes.map((client, index) => ({
    clientId: client.id,
    name: client.name,
    photo: photos[index] ?? null,
  }));
}

/**
 * Integrantes cujo acesso ainda nao esta liberado.
 *
 * O acesso nasce junto do cadastro, entao sobram apenas dois casos, os dois
 * resolvidos pelo ADMIN geral no proprio cadastro do integrante:
 *
 *   NO_PHONE        - cadastro antigo sem telefone;
 *   DUPLICATE_PHONE - o telefone se repete dentro do time (entre integrantes
 *                     ou com um Administrador do time ativo). Ninguem e
 *                     escolhido automaticamente: os dois ficam bloqueados ate
 *                     o numero ser corrigido.
 */
export async function listMembersWithoutAccess(): Promise<MemberWithoutAccess[]> {
  const members = await selectRows<
    Pick<
      MemberRow,
      | 'id'
      | 'client_id'
      | 'name'
      | 'phone'
      | 'photo_path'
      | 'recruited_by_user_id'
      | 'recruited_by_name'
      | 'recruited_by_role'
    >
  >(TABLES.members, {
    select:
      'id,client_id,name,phone,photo_path,recruited_by_user_id,recruited_by_name,recruited_by_role',
    order: 'created_at.asc',
  });
  if (members.length === 0) return [];

  const users = await selectRows<Pick<UserColumns, 'id' | 'member_id' | 'client_id' | 'phone' | 'is_active'>>(
    TABLES.users,
    { select: 'id,member_id,client_id,phone,is_active' },
  );

  const liberado = new Set(
    users.filter((user) => user.member_id && user.is_active && user.phone).map((user) => user.member_id),
  );

  // Telefone ocupado por outra pessoa ATIVA do mesmo time, seja ela
  // Administrador do time ou outro integrante.
  const ocupado = new Set(
    users
      .filter((user) => user.is_active && user.phone && user.client_id)
      .map((user) => `${user.client_id}:${user.phone}`),
  );

  const repetidos = new Map<string, number>();
  for (const member of members) {
    const phone = normalizePhone(member.phone ?? '');
    if (phone.length < 10) continue;
    const chave = `${member.client_id}:${phone}`;
    repetidos.set(chave, (repetidos.get(chave) ?? 0) + 1);
  }

  const userByMember = new Map(users.filter((user) => user.member_id).map((user) => [user.member_id, user]));

  const pendentes = members.filter((member) => !liberado.has(member.id));
  if (pendentes.length === 0) return [];

  const clients = await selectRows<Pick<ClientRow, 'id' | 'name'>>(TABLES.clients, {
    select: 'id,name',
    filters: { id: inFilter([...new Set(pendentes.map((member) => member.client_id))]) },
  });
  const clientName = new Map(clients.map((client) => [client.id, client.name]));

  const photos = await signedUrls(pendentes.map((member) => member.photo_path));

  return pendentes.map((member, index) => {
    const phone = normalizePhone(member.phone ?? '');
    const chave = `${member.client_id}:${phone}`;
    const proprio = userByMember.get(member.id);

    // Telefone tomado por outra pessoa do time, ou repetido entre
    // integrantes: em qualquer dos dois o acesso fica bloqueado.
    const duplicado =
      phone.length >= 10 &&
      ((repetidos.get(chave) ?? 0) > 1 ||
        (ocupado.has(chave) && !(proprio?.is_active && proprio.phone === phone)));

    return {
      memberId: member.id,
      clientId: member.client_id,
      candidateName: clientName.get(member.client_id) ?? '--',
      name: member.name,
      phone: phone || null,
      photo: photos[index] ?? null,
      status: (phone.length < 10
        ? 'NO_PHONE'
        : duplicado
          ? 'DUPLICATE_PHONE'
          : 'PENDING') as AccessStatus,
      recruitedBy: recruiterOf(member),
    };
  });
}

/* -------------------------------------------------------------------------
   Geracao de acesso
   ------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------
   Identidade de acesso do Administrador do time
   ------------------------------------------------------------------------- */

/** Usuario de um administrador do time, quando ja existe. */
async function findUserByTeamPerson(personId: string): Promise<UserColumns | null> {
  return selectOne<UserColumns>(TABLES.users, {
    select: USER_COLUMNS,
    filters: { team_person_id: `eq.${personId}` },
  });
}

/**
 * Confere o telefone antes de gravar.
 *
 * Um telefone ATIVO identifica uma unica pessoa dentro do mesmo time,
 * contando juntos os Administradores do time e os membros da equipe. Em
 * times diferentes o mesmo numero pode existir, porque o link identifica
 * primeiro qual time esta sendo acessado.
 *
 * `owner` isenta a propria pessoa da conferencia: sem isso, salvar o cadastro
 * sem trocar o numero acusaria conflito com ela mesma.
 */
export async function assertTeamPhoneAvailable(
  clientId: string,
  phone: string,
  owner?: { personId?: string | null; memberId?: string | null },
): Promise<void> {
  const normalized = normalizePhone(phone);
  if (normalized.length < 10) throw badRequest('Telefone inválido. Use DDD + número.');

  const conflicts = await selectRows<Pick<UserColumns, 'id' | 'team_person_id' | 'member_id'>>(
    TABLES.users,
    {
      select: 'id,team_person_id,member_id',
      filters: {
        client_id: `eq.${clientId}`,
        phone: `eq.${normalized}`,
        is_active: 'is.true',
      },
    },
  );

  const proprio = conflicts.every(
    (row) =>
      (owner?.personId && row.team_person_id === owner.personId) ||
      (owner?.memberId && row.member_id === owner.memberId),
  );
  if (conflicts.length > 0 && !proprio) throw phoneConflict();
}

/**
 * Cria a identidade de acesso de um administrador do time.
 *
 * O usuario nasce sem e-mail e sem senha: quem autentica e o par link do
 * time + telefone. O link pessoal de recrutamento dele nasce junto.
 */
export async function createTeamPersonUser(person: {
  clientId: string;
  personId: string;
  name: string;
  phone: string;
}): Promise<void> {
  const existing = await findUserByTeamPerson(person.personId);
  if (existing) return;

  const row = await insertOne<Pick<UserRow, 'id'>>(
    TABLES.users,
    {
      name: person.name,
      email: null,
      phone: normalizePhone(person.phone),
      role: 'CANDIDATE',
      client_id: person.clientId,
      team_person_id: person.personId,
      password_hash: null,
      must_change_password: false,
      is_active: true,
    },
    'id',
  );

  await ensurePersonalInvite(row.id, person.clientId);
}

/**
 * Mantem a identidade igual ao cadastro do administrador.
 *
 * Trocar o telefone derruba na hora todas as sessoes daquela pessoa: o
 * telefone antigo deixa de entrar imediatamente.
 */
export async function syncTeamPersonUser(person: {
  clientId: string;
  personId: string;
  name: string;
  phone: string;
}): Promise<void> {
  const user = await findUserByTeamPerson(person.personId);
  if (!user) {
    await createTeamPersonUser(person);
    return;
  }

  const phone = normalizePhone(person.phone);
  const name = person.name.trim();
  const changes: Record<string, string> = {};

  if (name && name !== user.name) changes.name = name;
  if (phone !== user.phone) changes.phone = phone;
  if (Object.keys(changes).length === 0) return;

  await updateRows<UserRow>(TABLES.users, { id: `eq.${user.id}` }, changes, 'id');

  // Telefone novo, aparelho novo: o vinculo atual e revogado junto das
  // sessoes, e o proximo acesso com o novo numero autoriza outro navegador.
  if (changes.phone) await releaseAdminDevice(user.id);
}

/**
 * Encerra o acesso de um administrador removido do time.
 *
 * As sessoes caem antes da exclusao; a linha em `cmd_users` sai junto com a
 * pessoa, pela cascata do banco. Os snapshots de quem ela cadastrou
 * permanecem: o historico continua existindo.
 */
export async function revokeTeamPersonUser(personId: string): Promise<void> {
  const user = await findUserByTeamPerson(personId);
  if (!user) return;

  await updateRows<UserRow>(TABLES.users, { id: `eq.${user.id}` }, { is_active: false }, 'id');
  // Aparelho autorizado e sessoes caem juntos: o navegador daquela pessoa
  // deixa de valer na hora.
  await releaseAdminDevice(user.id);
}

/* -------------------------------------------------------------------------
   Acesso do integrante (perfil EQUIPE)
   ------------------------------------------------------------------------- */

export interface MemberAccessSeed {
  clientId: string;
  memberId: string;
  name: string;
  /** Telefone do proprio cadastro. Normalizado aqui antes de gravar. */
  phone: string;
}

/**
 * Cria o acesso do integrante: usuario EQUIPE e link pessoal.
 *
 * O usuario nasce SEM e-mail e SEM senha — `email` e `password_hash` ficam
 * nulos, nenhuma senha temporaria e gerada e nenhum primeiro acesso e
 * exigido. Quem autentica e o par link do time + telefone, e o aparelho e
 * vinculado no primeiro acesso valido.
 *
 * A conferencia do telefone acontece ANTES (ver `assertTeamPhoneAvailable`),
 * para o cadastro parar sem deixar integrante orfao. Idempotente: chamada de
 * novo para o mesmo integrante, apenas devolve o usuario existente.
 */
export async function createMemberAccess(seed: MemberAccessSeed): Promise<string> {
  const existing = await findUserByMember(seed.memberId);
  if (existing) return existing.id;

  const row = await insertOne<Pick<UserRow, 'id'>>(
    TABLES.users,
    {
      name: seed.name.trim().slice(0, 120),
      email: null,
      phone: normalizePhone(seed.phone),
      role: 'EQUIPE',
      client_id: seed.clientId,
      member_id: seed.memberId,
      password_hash: null,
      must_change_password: false,
      is_active: true,
    },
    'id',
  );

  // O link pessoal de recrutamento nasce junto: e por ele que a pessoa
  // cadastra a propria equipe.
  await ensurePersonalInvite(row.id, seed.clientId);
  return row.id;
}

/**
 * Mantem o acesso do integrante igual ao cadastro dele.
 *
 * Vale para nome e telefone. Trocar o telefone revoga o aparelho autorizado
 * e derruba as sessoes na hora: o numero antigo deixa de entrar
 * imediatamente e o proximo acesso correto vincula um aparelho novo.
 *
 * Integrante que ainda nao tinha acesso — cadastro antigo sem telefone ou
 * bloqueado por telefone duplicado — passa a ter assim que o numero fica
 * valido e unico no time. E assim que a correcao feita pelo ADMIN geral
 * libera o acesso, sem nenhuma acao extra.
 */
export async function syncMemberAccess(
  memberId: string,
  patch: { clientId: string; name?: string; phone?: string | null },
): Promise<void> {
  const user = await findUserByMember(memberId);
  const phone = patch.phone === undefined ? undefined : normalizePhone(patch.phone ?? '');
  const name = patch.name?.trim();

  if (!user) {
    if (!phone || phone.length < 10 || !name) return;
    await createMemberAccess({
      clientId: patch.clientId,
      memberId,
      name,
      phone,
    });
    return;
  }

  const changes: Record<string, string | boolean | null> = {};
  if (name && name !== user.name) changes.name = name;

  if (phone !== undefined) {
    const valido = phone.length >= 10 ? phone : null;
    if (valido !== user.phone) changes.phone = valido;
    // Telefone valido devolve o acesso a quem estava bloqueado por
    // duplicidade ou por falta de numero.
    if (valido && !user.is_active) changes.is_active = true;
  }

  if (Object.keys(changes).length === 0) return;

  await updateRows<UserRow>(TABLES.users, { id: `eq.${user.id}` }, changes, 'id');

  // Telefone novo, aparelho novo: o vinculo atual cai junto das sessoes.
  if (changes.phone !== undefined) await releaseAdminDevice(user.id);
  await ensurePersonalInvite(user.id, patch.clientId).catch(() => undefined);
}

/* -------------------------------------------------------------------------
   Acoes sobre um usuario
   ------------------------------------------------------------------------- */

/**
 * Nova senha temporaria. Exclusiva do ADMIN geral.
 *
 * Nenhum outro perfil tem senha: o Administrador do time e o membro da
 * equipe entram por link do time + telefone, entao a acao e recusada para
 * eles aqui, e nao apenas escondida na tela.
 *
 * O primeiro acesso volta a ser obrigatorio e todas as sessoes caem, na
 * mesma transacao da funcao `cmd_set_temp_password`.
 */
export async function resetPassword(userId: string): Promise<GeneratedCredential> {
  const user = await requireUser(userId);
  if (usesPhoneAccess(user)) {
    throw badRequest('Este perfil entra pelo link do time e não usa senha.');
  }

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
  if (active) return;

  // Desativar quem entra por link + telefone tambem desfaz o vinculo do
  // aparelho: reativada, a pessoa autoriza um navegador novo no proximo
  // acesso valido.
  if (usesPhoneAccess(user)) await releaseAdminDevice(user.id);
  else await revokeUserSessions(user.id);
}

/**
 * Libera um novo aparelho.
 *
 * Vale para os dois perfis que entram por link do time + telefone: o
 * Administrador do time e o membro da equipe. Revoga o aparelho atual e
 * derruba as sessoes daquele usuario; telefone, nome, foto, time e link
 * continuam como estao, e o proximo acesso correto vincula o navegador novo.
 *
 * Exclusivo do ADMIN geral: a rota confere `settings.manage` e o papel antes
 * de chegar aqui.
 */
export async function releaseUserDevice(userId: string): Promise<number> {
  const user = await requireUser(userId);
  if (!usesPhoneAccess(user)) {
    throw badRequest('Este perfil não usa vínculo de aparelho.');
  }
  return releaseAdminDevice(user.id);
}

export async function revokeUserSessions(userId: string): Promise<number> {
  const count = await callFunction<number>('cmd_revoke_user_sessions', { p_user_id: userId });
  return typeof count === 'number' ? count : 0;
}

/* -------------------------------------------------------------------------
   Sincronizacao com o cadastro do integrante
   ------------------------------------------------------------------------- */

/**
 * Encerra o acesso do time antes da exclusao do cadastro.
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
