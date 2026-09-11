import 'server-only';
import type { Member, MemberInput } from '@/lib/types';
import { normalizePhone } from '@/lib/utils/phone';
import {
  isGenderValue,
  normalizeCpf,
  normalizePlace,
  normalizeState,
  normalizeVoterId,
} from '@/lib/utils/documents';
import {
  TABLES,
  type FormFieldRow,
  type MemberResponseRow,
  type MemberRow,
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
import { deleteImage, isDataUrl, signedUrl, signedUrls, uploadImage } from '@/lib/supabase/storage';
import { toMember } from './mappers';
import { notFound } from './http';
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

async function assembleMany(rows: MemberRow[]): Promise<Member[]> {
  if (rows.length === 0) return [];
  const [responses, photos] = await Promise.all([
    loadResponses(rows.map((row) => row.id)),
    signedUrls(rows.map((row) => row.photo_path)),
  ]);
  return rows.map((row, index) =>
    toMember(row, responses.get(row.id) ?? [], photos[index] ?? null),
  );
}

async function assembleOne(row: MemberRow): Promise<Member> {
  const [responses, photo] = await Promise.all([
    loadResponses([row.id]),
    signedUrl(row.photo_path),
  ]);
  return toMember(row, responses.get(row.id) ?? [], photo);
}

/**
 * Normaliza os campos padrao antes de gravar.
 *
 * Vazio vira nulo, para que o indice unico por cliente nao trate ausencia
 * como valor repetido. Valor invalido tambem vira nulo: a validacao completa
 * acontece no esquema Zod da rota.
 */
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
  if (input.city !== undefined) patch.city = normalizePlace(input.city ?? '') || null;
  if (input.district !== undefined) patch.district = normalizePlace(input.district ?? '') || null;

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

export async function getMember(id: string): Promise<Member | null> {
  const row = await selectOne<MemberRow>(TABLES.members, {
    select: '*',
    filters: { id: `eq.${id}` },
  });
  return row ? assembleOne(row) : null;
}

export async function createMember(input: MemberInput): Promise<Member> {
  // O navegador apenas sinaliza que aceitou. A data, o texto e o hash sao do
  // servidor, a partir do aviso vigente em cmd_clients.
  const consent = input.consentAt
    ? await buildConsentEvidence(input.clientId)
    : EMPTY_CONSENT;

  const photo =
    input.photo && isDataUrl(input.photo) ? await uploadImage('members', input.photo) : null;

  const row = await insertOne<MemberRow>(TABLES.members, {
    client_id: input.clientId,
    name: input.name.trim(),
    phone: normalizePhone(input.phone),
    photo_path: photo?.path ?? null,
    photo_mime: photo?.mime ?? null,
    photo_size: photo?.size ?? null,
    ...standardColumns(input),
    ...consent,
    source: input.source,
  });

  await writeResponses(row.id, input.clientId, input.responses ?? []);
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

  return assembleOne(row ?? current);
}

export async function deleteMember(id: string): Promise<void> {
  const current = await requireMemberRow(id);
  await deleteImage(current.photo_path);
  await deleteRows(TABLES.members, { id: `eq.${id}` });
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
