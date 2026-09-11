import 'server-only';
import type { AccessStatus, Member, MemberInput, Recruiter, SessionUser } from '@/lib/types';
import { canReachMember } from '@/lib/permissions';
import { normalizePhone } from '@/lib/utils/phone';
import { isValidEmail, normalizeEmail } from '@/lib/utils/email';
import {
  isGenderValue,
  normalizeCpf,
  normalizePlace,
  normalizeState,
  normalizeVoterId,
} from '@/lib/utils/documents';
import { OTHER_OPTION } from '@/lib/domain/location';
import {
  TABLES,
  type ClientRow,
  type FormFieldRow,
  type MemberResponseRow,
  type MemberRow,
  type UserRow,
} from '@/lib/supabase/tables';
import {
  deleteRows,
  inFilter,
  insertOne,
  insertRows,
  selectOne,
  selectRows,
  updateRows,
} from '@/lib/supabase/rest';
import { deleteImage, isDataUrl, signedUrls, uploadImage } from '@/lib/supabase/storage';
import { createPendingLocation, invalidateLocation } from './map-location.service';
import { toMember, toRecruiter } from './mappers';
import { forbidden, notFound } from './http';
import { EMPTY_CONSENT, buildConsentEvidence } from './consent';

/**
 * Regras de integrante no servidor: respostas, fotos, consentimento e
 * isolamento por cliente.
 */

async function loadResponses(memberIds: string[]): Promise<Map<string, MemberResponseRow[]>> {
  const grouped = new Map<string, MemberResponseRow[]>();
  if (memberIds.length === 0) return grouped;

  const rows = await selectRows<MemberResponseRow>(TABLES.memberResponses, {
    select: '*',
    filters: { member_id: inFilter(memberIds) },
  });

  for (const row of rows) {
    const list = grouped.get(row.member_id) ?? [];
    list.push(row);
    grouped.set(row.member_id, list);
  }
  return grouped;
}

/**
 * Estado do acesso e foto do responsavel, resolvidos em bloco.
 *
 * A foto do responsavel vem do cadastro dele: do time quando o
 * responsavel e o CANDIDATE, do proprio integrante quando e EQUIPE. Usuario
 * ja excluido nao tem foto, mas o nome e o perfil continuam no snapshot.
 */
interface MemberContext {
  recruiterPhoto: Map<string, string | null>;
  access: Map<string, AccessStatus>;
}

type AccessColumns = Pick<UserRow, 'member_id' | 'is_active' | 'password_hash'>;

function statusOf(row: AccessColumns | undefined, email: string | null): AccessStatus {
  // Sem e-mail nao ha como entrar: o integrante antigo fica assim ate que
  // alguem informe o endereco.
  if (!email) return 'NO_EMAIL';
  if (!row) return 'PENDING';
  if (!row.is_active) return 'DISABLED';
  return row.password_hash ? 'ACTIVE' : 'PENDING';
}

async function loadContext(rows: MemberRow[]): Promise<MemberContext> {
  const context: MemberContext = { recruiterPhoto: new Map(), access: new Map() };
  if (rows.length === 0) return context;

  const recruiterIds = [
    ...new Set(rows.map((row) => row.recruited_by_user_id).filter((id): id is string => Boolean(id))),
  ];

  const [users, recruiters] = await Promise.all([
    selectRows<AccessColumns>(TABLES.users, {
      select: 'member_id,is_active,password_hash',
      filters: { member_id: inFilter(rows.map((row) => row.id)) },
    }),
    recruiterIds.length
      ? selectRows<Pick<UserRow, 'id' | 'role' | 'client_id' | 'member_id'>>(TABLES.users, {
          select: 'id,role,client_id,member_id',
          filters: { id: inFilter(recruiterIds) },
        })
      : Promise.resolve([]),
  ]);

  const byMember = new Map(users.map((row) => [row.member_id, row]));
  for (const row of rows) {
    context.access.set(row.id, statusOf(byMember.get(row.id) ?? undefined, row.email));
  }

  if (recruiters.length === 0) return context;

  const memberIds = recruiters.map((row) => row.member_id).filter((id): id is string => Boolean(id));
  const clientIds = recruiters
    .filter((row) => row.role === 'CANDIDATE')
    .map((row) => row.client_id)
    .filter((id): id is string => Boolean(id));

  const [recruiterMembers, recruiterClients] = await Promise.all([
    memberIds.length
      ? selectRows<Pick<MemberRow, 'id' | 'photo_path'>>(TABLES.members, {
          select: 'id,photo_path',
          filters: { id: inFilter(memberIds) },
        })
      : Promise.resolve([]),
    clientIds.length
      ? selectRows<Pick<ClientRow, 'id' | 'photo_path'>>(TABLES.clients, {
          select: 'id,photo_path',
          filters: { id: inFilter(clientIds) },
        })
      : Promise.resolve([]),
  ]);

  const paths = new Map<string, string | null>();
  for (const row of recruiterMembers) paths.set(`m:${row.id}`, row.photo_path);
  for (const row of recruiterClients) paths.set(`c:${row.id}`, row.photo_path);

  const wanted = recruiters.map((row) =>
    row.member_id ? (paths.get(`m:${row.member_id}`) ?? null) : (paths.get(`c:${row.client_id}`) ?? null),
  );
  const urls = await signedUrls(wanted);
  recruiters.forEach((row, index) => context.recruiterPhoto.set(row.id, urls[index] ?? null));

  return context;
}

function recruiterOf(row: MemberRow, context: MemberContext): Recruiter | null {
  const photo = row.recruited_by_user_id
    ? (context.recruiterPhoto.get(row.recruited_by_user_id) ?? null)
    : null;
  return toRecruiter(row, photo);
}

async function assembleMany(rows: MemberRow[]): Promise<Member[]> {
  if (rows.length === 0) return [];
  const [responses, photos, context] = await Promise.all([
    loadResponses(rows.map((row) => row.id)),
    signedUrls(rows.map((row) => row.photo_path)),
    loadContext(rows),
  ]);

  return rows.map((row, index) =>
    toMember(row, {
      responses: responses.get(row.id) ?? [],
      photoUrl: photos[index] ?? null,
      recruitedBy: recruiterOf(row, context),
      access: context.access.get(row.id) ?? 'NO_EMAIL',
    }),
  );
}

async function assembleOne(row: MemberRow): Promise<Member> {
  const [assembled] = await assembleMany([row]);
  return assembled;
}

/**
 * Normaliza os campos padrao antes de gravar.
 *
 * Vazio vira nulo, para que o indice unico por cliente nao trate ausencia
 * como valor repetido. Valor invalido tambem vira nulo: a validacao completa
 * acontece no esquema Zod da rota.
 */
/**
 * Nome de localidade pronto para gravar.
 *
 * O marcador da opcao "Outro" vive so na tela: se por qualquer caminho ele
 * chegar aqui, vira ausencia de valor, nunca um nome.
 */
function place(value: string | null | undefined): string | null {
  const normalized = normalizePlace(value ?? '');
  return !normalized || normalized === OTHER_OPTION ? null : normalized;
}

function standardColumns(
  input: Partial<
    Pick<
      MemberInput,
      | 'gender'
      | 'cpf'
      | 'voterId'
      | 'state'
      | 'city'
      | 'district'
      | 'street'
      | 'relationshipOptionId'
      | 'relationshipLabel'
    >
  >,
): Record<string, string | null> {
  const patch: Record<string, string | null> = {};

  if (input.gender !== undefined) {
    const value = (input.gender ?? '').trim();
    patch.gender = value && isGenderValue(value) ? value : null;
  }
  if (input.cpf !== undefined) patch.cpf = normalizeCpf(input.cpf ?? '') || null;
  if (input.voterId !== undefined) patch.voter_id = normalizeVoterId(input.voterId ?? '') || null;
  if (input.state !== undefined) patch.state = normalizeState(input.state ?? '') || null;
  if (input.city !== undefined) patch.city = place(input.city);
  if (input.district !== undefined) patch.district = place(input.district);
  if (input.street !== undefined) patch.street = place(input.street);

  // As duas colunas do vinculo andam juntas, como exige o check do banco.
  if (input.relationshipOptionId !== undefined) {
    const id = (input.relationshipOptionId ?? '').trim();
    const label = (input.relationshipLabel ?? '').trim();
    const valido = Boolean(id) && Boolean(label);
    patch.relationship_option_id = valido ? id : null;
    patch.relationship_label = valido ? label.slice(0, 80) : null;
  }

  return patch;
}

async function requireMemberRow(id: string): Promise<MemberRow> {
  const row = await selectOne<MemberRow>(TABLES.members, {
    select: '*',
    filters: { id: `eq.${id}` },
  });
  if (!row) throw notFound('Integrante não encontrado.');
  return row;
}

/** Descarta respostas de campos que nao pertencem ao formulario do cliente. */
async function keepKnownResponses(
  clientId: string,
  responses: MemberInput['responses'],
): Promise<MemberInput['responses']> {
  if (responses.length === 0) return [];

  const fields = await selectRows<Pick<FormFieldRow, 'id'>>(TABLES.formFields, {
    select: 'id',
    filters: { client_id: `eq.${clientId}` },
  });
  const known = new Set(fields.map((field) => field.id));

  const seen = new Set<string>();
  return responses.filter((response) => {
    if (!known.has(response.fieldId) || seen.has(response.fieldId)) return false;
    seen.add(response.fieldId);
    return true;
  });
}

async function writeResponses(
  memberId: string,
  clientId: string,
  responses: MemberInput['responses'],
): Promise<void> {
  const valid = await keepKnownResponses(clientId, responses);
  await deleteRows(TABLES.memberResponses, { member_id: `eq.${memberId}` });
  if (valid.length === 0) return;

  await insertRows<MemberResponseRow>(
    TABLES.memberResponses,
    valid.map((response) => ({
      // O banco confere, pelas chaves compostas, que integrante e campo
      // pertencem a este mesmo cliente.
      client_id: clientId,
      member_id: memberId,
      field_id: response.fieldId,
      value: response.value as object,
    })),
    'id',
  );
}

export async function listAllMembers(): Promise<Member[]> {
  const rows = await selectRows<MemberRow>(TABLES.members, {
    select: '*',
    order: 'created_at.desc',
  });
  return assembleMany(rows);
}

export async function listMembersByClient(clientId: string): Promise<Member[]> {
  const rows = await selectRows<MemberRow>(TABLES.members, {
    select: '*',
    filters: { client_id: `eq.${clientId}` },
    order: 'created_at.desc',
  });
  return assembleMany(rows);
}

/**
 * Recrutados diretos de um usuario.
 *
 * O filtro vai para a consulta, nao para a tela: mudar URL, `memberId`,
 * `clientId`, filtro ou corpo da requisicao nao traz uma linha a mais.
 */
export async function listMembersRecruitedBy(
  userId: string,
  clientId: string,
): Promise<Member[]> {
  const rows = await selectRows<MemberRow>(TABLES.members, {
    select: '*',
    filters: { client_id: `eq.${clientId}`, recruited_by_user_id: `eq.${userId}` },
    order: 'created_at.desc',
  });
  return assembleMany(rows);
}

/**
 * Equipe visivel para a sessao, com a hierarquia aplicada na consulta.
 *
 * ADMIN e CANDIDATE veem a operacao inteira, em todos os niveis; EQUIPE ve
 * somente quem se cadastrou pelo proprio link.
 */
export async function listMembersForUser(
  user: Pick<SessionUser, 'id' | 'role' | 'candidateId'>,
  clientId: string,
): Promise<Member[]> {
  if (user.role === 'EQUIPE') {
    if (user.candidateId !== clientId) throw forbidden();
    return listMembersRecruitedBy(user.id, clientId);
  }
  return listMembersByClient(clientId);
}

export async function getMember(id: string): Promise<Member | null> {
  const row = await selectOne<MemberRow>(TABLES.members, {
    select: '*',
    filters: { id: `eq.${id}` },
  });
  return row ? assembleOne(row) : null;
}

/**
 * Integrante alcancavel pela sessao, ou nulo.
 *
 * Segunda barreira depois do guard das rotas: mesmo que alguem chegue aqui
 * por outro caminho, a hierarquia e reaplicada sobre a linha do banco.
 */
export async function getMemberForUser(
  user: Pick<SessionUser, 'id' | 'role' | 'candidateId'>,
  id: string,
): Promise<Member | null> {
  const row = await selectOne<MemberRow>(TABLES.members, {
    select: '*',
    filters: { id: `eq.${id}` },
  });
  if (!row) return null;

  const allowed = canReachMember(user, {
    clientId: row.client_id,
    recruitedByUserId: row.recruited_by_user_id,
  });
  if (!allowed) throw forbidden();

  return assembleOne(row);
}

/**
 * Origem do cadastro, sempre decidida no servidor.
 *
 * O navegador nunca escolhe o responsavel: quem chama passa o dono do link
 * ja resolvido pelo token, ou o ADMIN autenticado.
 */
export interface RecruitedBy {
  userId: string;
  name: string;
  role: 'ADMIN' | 'CANDIDATE' | 'EQUIPE';
}

function recruiterColumns(recruitedBy?: RecruitedBy | null): Record<string, string | null> {
  if (!recruitedBy) return {};
  return {
    recruited_by_user_id: recruitedBy.userId,
    recruited_by_name: recruitedBy.name.trim().slice(0, 120),
    recruited_by_role: recruitedBy.role,
  };
}

export async function createMember(
  input: MemberInput,
  recruitedBy?: RecruitedBy | null,
): Promise<Member> {
  // O navegador apenas sinaliza que aceitou. A data, o texto e o hash sao do
  // servidor, a partir do aviso vigente em cmd_clients.
  const consent = input.consentAt
    ? await buildConsentEvidence(input.clientId)
    : EMPTY_CONSENT;

  const photo =
    input.photo && isDataUrl(input.photo) ? await uploadImage('members', input.photo) : null;

  const email = normalizeEmail(input.email);

  const row = await insertOne<MemberRow>(TABLES.members, {
    client_id: input.clientId,
    name: input.name.trim(),
    phone: normalizePhone(input.phone),
    email: email && isValidEmail(email) ? email : null,
    photo_path: photo?.path ?? null,
    photo_mime: photo?.mime ?? null,
    photo_size: photo?.size ?? null,
    ...standardColumns(input),
    ...consent,
    ...recruiterColumns(recruitedBy),
    source: input.source,
  });

  await writeResponses(row.id, input.clientId, input.responses ?? []);

  // Moradia aproximada: o vinculo nasce pendente e e resolvido fora do
  // caminho da resposta. O cadastro nunca depende disso.
  await createPendingLocation(input.clientId, row.id, 'RESIDENCE').catch(() => undefined);

  return assembleOne(row);
}

export async function updateMember(
  id: string,
  input: Partial<Omit<MemberInput, 'clientId'>>,
): Promise<Member> {
  const current = await requireMemberRow(id);
  const patch: Record<string, string | number | null> = {};

  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.phone !== undefined) patch.phone = normalizePhone(input.phone);
  if (input.email !== undefined) {
    const email = normalizeEmail(input.email);
    patch.email = email && isValidEmail(email) ? email : null;
  }
  Object.assign(patch, standardColumns(input));

  if (input.consentAt !== undefined) {
    // Registrar de novo o aceite regrava a evidencia com o aviso atual;
    // retirar o aceite limpa a evidencia inteira.
    Object.assign(
      patch,
      input.consentAt ? await buildConsentEvidence(current.client_id) : EMPTY_CONSENT,
    );
  }

  if (input.photo !== undefined) {
    if (input.photo === null) {
      await deleteImage(current.photo_path);
      patch.photo_path = null;
      patch.photo_mime = null;
      patch.photo_size = null;
    } else if (isDataUrl(input.photo)) {
      const uploaded = await uploadImage('members', input.photo);
      await deleteImage(current.photo_path);
      patch.photo_path = uploaded.path;
      patch.photo_mime = uploaded.mime;
      patch.photo_size = uploaded.size;
    }
  }

  const [row] = await updateRows<MemberRow>(TABLES.members, { id: `eq.${id}` }, patch);
  if (input.responses !== undefined) {
    await writeResponses(id, current.client_id, input.responses);
  }

  // Endereco declarado diferente: so a moradia e reconsultada. O local de
  // votacao nao e tocado.
  const moved = (['street', 'district', 'city', 'state'] as const).some(
    (column) => patch[column] !== undefined && patch[column] !== current[column],
  );
  if (moved) {
    await invalidateLocation(current.client_id, id, 'RESIDENCE').catch(() => undefined);
  }

  return assembleOne(row ?? current);
}

/**
 * Remove o integrante.
 *
 * O usuario EQUIPE dele sai junto pela cascata do banco, e quem ele tiver
 * cadastrado mantem o texto historico: o identificador do responsavel vira
 * nulo, o nome e o perfil continuam gravados.
 */
export async function deleteMember(id: string): Promise<void> {
  const current = await requireMemberRow(id);
  await deleteImage(current.photo_path);
  await deleteRows(TABLES.members, { id: `eq.${id}` });
}

/** Confere se o e-mail ja pertence a outro integrante. */
export async function findMemberByEmail(email: string): Promise<MemberRow | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return selectOne<MemberRow>(TABLES.members, {
    select: '*',
    filters: { email: `eq.${normalized}` },
  });
}

/** Apaga um integrante recem-criado quando a criacao do acesso falha. */
export async function rollbackMember(id: string): Promise<void> {
  const row = await selectOne<Pick<MemberRow, 'id' | 'photo_path'>>(TABLES.members, {
    select: 'id,photo_path',
    filters: { id: `eq.${id}` },
  });
  if (!row) return;
  await deleteImage(row.photo_path).catch(() => undefined);
  await deleteRows(TABLES.members, { id: `eq.${id}` }).catch(() => []);
}

export async function deleteMembersByClient(clientId: string): Promise<number> {
  const rows = await selectRows<Pick<MemberRow, 'id' | 'photo_path'>>(TABLES.members, {
    select: 'id,photo_path',
    filters: { client_id: `eq.${clientId}` },
  });
  if (rows.length === 0) return 0;

  for (const row of rows) await deleteImage(row.photo_path);
  await deleteRows(TABLES.members, { client_id: `eq.${clientId}` });
  return rows.length;
}
