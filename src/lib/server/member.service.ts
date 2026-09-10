import 'server-only';
import type { Member, MemberInput } from '@/lib/types';
import { normalizePhone } from '@/lib/utils/phone';
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

/** Regras de integrante no servidor: respostas, fotos e isolamento por cliente. */

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

async function requireMemberRow(id: string): Promise<MemberRow> {
  const row = await selectOne<MemberRow>(TABLES.members, {
    select: '*',
    filters: { id: `eq.${id}` },
  });
  if (!row) throw notFound('Integrante nao encontrado.');
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
  const photo =
    input.photo && isDataUrl(input.photo) ? await uploadImage('members', input.photo) : null;

  const row = await insertOne<MemberRow>(TABLES.members, {
    client_id: input.clientId,
    name: input.name.trim(),
    phone: normalizePhone(input.phone),
    photo_path: photo?.path ?? null,
    photo_mime: photo?.mime ?? null,
    photo_size: photo?.size ?? null,
    consent_at: input.consentAt,
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
  if (input.consentAt !== undefined) patch.consent_at = input.consentAt;

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
