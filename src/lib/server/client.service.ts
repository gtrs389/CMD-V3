import 'server-only';
import type {
  Client,
  ClientFormConfig,
  ClientInput,
  ClientSummary,
  CustomField,
} from '@/lib/types';
import { appConfig } from '@/config/app.config';
import { createSystemFields } from '@/lib/domain/form-config';
import { createInviteToken, hashToken } from '@/lib/auth/tokens';
import {
  TABLES,
  type ClientRow,
  type FormFieldRow,
  type InviteRow,
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
import { daysAgoIso, startOfMonthIso } from '@/lib/utils/date';
import { toClient } from './mappers';
import { notFound } from './http';

/**
 * Regras de cliente no servidor.
 *
 * Nenhuma tela conversa com o Supabase: elas chamam as rotas de API, que
 * chamam este servico. Aqui ficam a montagem do formulario padrao, o convite
 * (guardado apenas como hash) e o tratamento das fotos no bucket privado.
 */

const CLIENT_COLUMNS = '*';

/** Quantidade de fotos exibidas na pilha de integrantes recentes. */
const RECENT_MEMBERS = 3;

async function loadFields(clientIds: string[]): Promise<Map<string, FormFieldRow[]>> {
  const grouped = new Map<string, FormFieldRow[]>();
  if (clientIds.length === 0) return grouped;

  const rows = await selectRows<FormFieldRow>(TABLES.formFields, {
    select: '*',
    filters: { client_id: inFilter(clientIds) },
    order: 'position.asc',
  });

  for (const row of rows) {
    const list = grouped.get(row.client_id) ?? [];
    list.push(row);
    grouped.set(row.client_id, list);
  }
  return grouped;
}

async function loadInvites(clientIds: string[]): Promise<Map<string, InviteRow>> {
  const map = new Map<string, InviteRow>();
  if (clientIds.length === 0) return map;

  const rows = await selectRows<InviteRow>(TABLES.invites, {
    select: '*',
    filters: { client_id: inFilter(clientIds) },
  });
  for (const row of rows) map.set(row.client_id, row);
  return map;
}

/** Cria as linhas dos campos nativos de um cliente recem-criado. */
async function insertDefaultFields(clientId: string): Promise<FormFieldRow[]> {
  const defaults = createSystemFields();
  return insertRows<FormFieldRow>(
    TABLES.formFields,
    defaults.map((field) => ({
      client_id: clientId,
      system_key: field.systemKey,
      type: field.type,
      label: field.label,
      placeholder: field.placeholder,
      help_text: field.helpText,
      required: field.required,
      enabled: field.enabled,
      position: field.order,
      options: field.options,
    })),
  );
}

async function requireClientRow(id: string): Promise<ClientRow> {
  const row = await selectOne<ClientRow>(TABLES.clients, {
    select: CLIENT_COLUMNS,
    filters: { id: `eq.${id}` },
  });
  if (!row) throw notFound('Cliente não encontrado.');
  return row;
}

async function assemble(row: ClientRow, inviteToken?: string | null): Promise<Client> {
  const [fields, invites, photo] = await Promise.all([
    loadFields([row.id]),
    loadInvites([row.id]),
    signedUrl(row.photo_path),
  ]);

  return toClient(row, {
    fields: fields.get(row.id) ?? [],
    invite: invites.get(row.id) ?? null,
    photoUrl: photo,
    inviteToken: inviteToken ?? null,
  });
}

export async function listClientSummaries(): Promise<ClientSummary[]> {
  const rows = await selectRows<ClientRow>(TABLES.clients, {
    select: CLIENT_COLUMNS,
    order: 'created_at.desc',
  });
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const [fields, invites, photos, members] = await Promise.all([
    loadFields(ids),
    loadInvites(ids),
    signedUrls(rows.map((row) => row.photo_path)),
    selectRows<Pick<MemberRow, 'id' | 'client_id' | 'name' | 'photo_path' | 'created_at'>>(
      TABLES.members,
      {
        select: 'id,client_id,name,photo_path,created_at',
        filters: { client_id: inFilter(ids) },
        order: 'created_at.desc',
      },
    ),
  ]);

  const monthStart = startOfMonthIso();
  const weekStart = daysAgoIso(7);

  interface Aggregate {
    total: number;
    month: number;
    week: number;
    last: string | null;
    recent: typeof members;
  }

  const counts = new Map<string, Aggregate>();
  for (const member of members) {
    const current =
      counts.get(member.client_id) ?? { total: 0, month: 0, week: 0, last: null, recent: [] };
    current.total += 1;
    if (member.created_at >= monthStart) current.month += 1;
    if (member.created_at >= weekStart) current.week += 1;
    if (!current.last || member.created_at > current.last) current.last = member.created_at;
    if (current.recent.length < RECENT_MEMBERS) current.recent.push(member);
    counts.set(member.client_id, current);
  }

  // Uma unica assinatura para todas as fotos exibidas na pilha dos cartoes.
  const recentRows = [...counts.values()].flatMap((aggregate) => aggregate.recent);
  const recentPhotos = await signedUrls(recentRows.map((member) => member.photo_path));
  const photoById = new Map(recentRows.map((member, index) => [member.id, recentPhotos[index] ?? null]));

  return rows.map((row, index) => {
    const aggregate = counts.get(row.id);
    return {
      ...toClient(row, {
        fields: fields.get(row.id) ?? [],
        invite: invites.get(row.id) ?? null,
        photoUrl: photos[index] ?? null,
      }),
      memberCount: aggregate?.total ?? 0,
      lastMemberAt: aggregate?.last ?? null,
      memberCountThisMonth: aggregate?.month ?? 0,
      memberCountLast7Days: aggregate?.week ?? 0,
      recentMembers: (aggregate?.recent ?? []).map((member) => ({
        id: member.id,
        name: member.name,
        photo: photoById.get(member.id) ?? null,
      })),
    };
  });
}

export async function getClient(id: string): Promise<Client | null> {
  const row = await selectOne<ClientRow>(TABLES.clients, {
    select: CLIENT_COLUMNS,
    filters: { id: `eq.${id}` },
  });
  return row ? assemble(row) : null;
}

/** Rota publica: resolve o cliente pelo token bruto do link. */
export async function getClientByInviteToken(token: string): Promise<Client | null> {
  if (!token) return null;

  const invite = await selectOne<InviteRow>(TABLES.invites, {
    select: '*',
    filters: { token_hash: `eq.${hashToken(token)}` },
  });
  if (!invite) return null;

  const row = await selectOne<ClientRow>(TABLES.clients, {
    select: CLIENT_COLUMNS,
    filters: { id: `eq.${invite.client_id}` },
  });
  if (!row) return null;

  const [fields, photo] = await Promise.all([loadFields([row.id]), signedUrl(row.photo_path)]);
  return toClient(row, {
    fields: fields.get(row.id) ?? [],
    invite,
    photoUrl: photo,
    inviteToken: token,
  });
}

export async function createClient(input: ClientInput): Promise<Client> {
  const photo = input.photo && isDataUrl(input.photo) ? await uploadImage('clients', input.photo) : null;

  const row = await insertOne<ClientRow>(TABLES.clients, {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    notes: input.notes?.trim() ?? '',
    photo_path: photo?.path ?? null,
    photo_mime: photo?.mime ?? null,
    photo_size: photo?.size ?? null,
    privacy_enabled: appConfig.privacy.enabledByDefault,
    privacy_title: appConfig.privacy.defaultTitle,
    privacy_text: appConfig.privacy.defaultText,
    privacy_consent_label: appConfig.privacy.defaultConsentLabel,
  });

  await insertDefaultFields(row.id);
  const token = createInviteToken();
  await insertOne<InviteRow>(
    TABLES.invites,
    { client_id: row.id, token_hash: hashToken(token), active: true },
    'id',
  );

  return assemble(row, token);
}

export async function updateClient(id: string, input: Partial<ClientInput>): Promise<Client> {
  const current = await requireClientRow(id);
  const patch: Record<string, string | number | null> = {};

  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.email !== undefined) patch.email = input.email.trim().toLowerCase();
  if (input.notes !== undefined) patch.notes = input.notes.trim();

  if (input.photo !== undefined) {
    if (input.photo === null) {
      await deleteImage(current.photo_path);
      patch.photo_path = null;
      patch.photo_mime = null;
      patch.photo_size = null;
    } else if (isDataUrl(input.photo)) {
      const uploaded = await uploadImage('clients', input.photo);
      await deleteImage(current.photo_path);
      patch.photo_path = uploaded.path;
      patch.photo_mime = uploaded.mime;
      patch.photo_size = uploaded.size;
    }
    // Qualquer outro valor e a URL assinada devolvida antes: a foto nao mudou.
  }

  const [row] = await updateRows<ClientRow>(TABLES.clients, { id: `eq.${id}` }, patch);
  return assemble(row ?? current);
}

export async function deleteClient(id: string): Promise<void> {
  const current = await requireClientRow(id);

  // As fotos vivem no Storage: a exclusao em cascata do banco nao as alcanca.
  const members = await selectRows<Pick<MemberRow, 'photo_path'>>(TABLES.members, {
    select: 'photo_path',
    filters: { client_id: `eq.${id}` },
  });
  for (const member of members) await deleteImage(member.photo_path);
  await deleteImage(current.photo_path);

  await deleteRows(TABLES.clients, { id: `eq.${id}` });
}

/** Sincroniza a lista de campos: atualiza, cria e remove conforme o enviado. */
async function syncFields(clientId: string, fields: CustomField[]): Promise<void> {
  const existing = await selectRows<FormFieldRow>(TABLES.formFields, {
    select: '*',
    filters: { client_id: `eq.${clientId}` },
  });
  const byId = new Map(existing.map((row) => [row.id, row]));

  const keptIds = new Set<string>();
  const toInsert: Record<string, unknown>[] = [];

  for (const [index, field] of fields.entries()) {
    const current = byId.get(field.id);
    const values = {
      system_key: current?.system_key ?? null,
      type: current?.system_key ? current.type : field.type,
      label: field.label,
      placeholder: field.placeholder,
      help_text: field.helpText,
      required: field.required,
      enabled: field.enabled,
      position: index,
      options: field.options,
    };

    if (current) {
      keptIds.add(current.id);
      await updateRows<FormFieldRow>(TABLES.formFields, { id: `eq.${current.id}` }, values, 'id');
    } else {
      // Campo novo: o identificador definitivo e gerado pelo banco.
      toInsert.push({ client_id: clientId, ...values });
    }
  }

  if (toInsert.length > 0) {
    await insertRows<FormFieldRow>(
      TABLES.formFields,
      toInsert as Parameters<typeof insertRows>[1],
      'id',
    );
  }

  // Campos nativos nunca sao removidos, mesmo que faltem no envio.
  const removable = existing
    .filter((row) => !keptIds.has(row.id) && row.system_key === null)
    .map((row) => row.id);

  if (removable.length > 0) {
    await deleteRows(TABLES.formFields, { id: inFilter(removable) });
  }
}

export async function updateClientForm(
  id: string,
  form: Partial<Omit<ClientFormConfig, 'updatedAt'>>,
): Promise<Client> {
  const current = await requireClientRow(id);
  const patch: Record<string, string | boolean> = { form_updated_at: new Date().toISOString() };

  if (form.introText !== undefined) patch.form_intro_text = form.introText;
  if (form.successMessage !== undefined) patch.form_success_message = form.successMessage;
  if (form.privacy !== undefined) {
    patch.privacy_enabled = form.privacy.enabled;
    patch.privacy_title = form.privacy.title;
    patch.privacy_text = form.privacy.text;
    patch.privacy_require_consent = form.privacy.requireConsent;
    patch.privacy_consent_label = form.privacy.consentLabel;
  }

  if (form.fields !== undefined) await syncFields(id, form.fields);

  const [row] = await updateRows<ClientRow>(TABLES.clients, { id: `eq.${id}` }, patch);
  return assemble(row ?? current);
}

export async function setInviteActive(id: string, active: boolean): Promise<Client> {
  const row = await requireClientRow(id);
  await updateRows<InviteRow>(TABLES.invites, { client_id: `eq.${id}` }, { active }, 'id');
  return assemble(row);
}

/** Gera um novo token. O anterior deixa de existir: guardamos apenas o hash. */
export async function regenerateInvite(id: string): Promise<Client> {
  const row = await requireClientRow(id);
  const token = createInviteToken();

  const [updated] = await updateRows<InviteRow>(
    TABLES.invites,
    { client_id: `eq.${id}` },
    { token_hash: hashToken(token), rotated_at: new Date().toISOString() },
    'id',
  );

  if (!updated) {
    await insertOne<InviteRow>(
      TABLES.invites,
      { client_id: id, token_hash: hashToken(token), active: true },
      'id',
    );
  }

  return assemble(row, token);
}
