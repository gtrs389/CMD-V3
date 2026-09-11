import 'server-only';
import type {
  Client,
  ClientFormConfig,
  ClientInput,
  ClientSummary,
  CustomField,
  PublicInviteOwner,
} from '@/lib/types';
import { appConfig } from '@/config/app.config';
import { createSystemFields } from '@/lib/domain/form-config';
import { normalizeEmail } from '@/lib/utils/email';
import {
  TABLES,
  type ClientRow,
  type FormFieldRow,
  type InviteRow,
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
import { deleteImage, isDataUrl, signedUrl, signedUrls, uploadImage } from '@/lib/supabase/storage';
import { daysAgoIso, startOfMonthIso } from '@/lib/utils/date';
import { toClient } from './mappers';
import {
  ensurePersonalInvite,
  inviteAccepts,
  inviteFinished,
  loadOperationInvites,
  resolveInvite,
  rotatePersonalInvite,
  type InviteOwner,
} from './invite.service';
import { assertEmailAvailable, disableCandidateAccess, syncCandidateLogin } from './user.service';
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

/**
 * Convite da operacao: o link pessoal do proprio time.
 *
 * Cada integrante tem o seu, mas o que aparece na tela do time e no
 * painel do ADMIN e o link do time.
 */
async function loadInvites(clientIds: string[]): Promise<Map<string, InviteRow>> {
  return loadOperationInvites(clientIds);
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
  if (!row) throw notFound('Time não encontrado.');
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

/**
 * Rota publica: resolve a operacao e o responsavel a partir do link.
 *
 * O formulario e sempre o configurado pelo time, o mesmo em todos os
 * links daquela operacao. O responsavel vem do token, nunca do corpo da
 * requisicao.
 */
export interface PublicInviteContext {
  client: Client;
  /** Dono do link. Nulo apenas em convite legado sem usuario. */
  owner: InviteOwner | null;
  /** O mesmo dono, na forma que a pagina publica pode receber. */
  publicOwner: PublicInviteOwner | null;
  /** O link aceita cadastro agora: ligado, no prazo e ainda aberto. */
  accepts: boolean;
  /** Prazo vencido, cadastro concluido ou token substituido. */
  finished: boolean;
}

/**
 * Dono do link como a pagina publica o mostra.
 *
 * Sai daqui apenas nome, foto e perfil. A foto do time e a do proprio
 * cadastro; a do integrante vem da linha dele. Identificador de usuario, de
 * integrante e e-mail ficam no servidor.
 */
async function publicOwner(
  owner: InviteOwner | null,
  clientPhotoUrl: string | null,
): Promise<PublicInviteOwner | null> {
  if (!owner) return null;

  if (owner.role === 'CANDIDATE') {
    return { name: owner.name, photoUrl: clientPhotoUrl, role: 'CANDIDATE' };
  }

  let photoUrl: string | null = null;
  if (owner.memberId) {
    const member = await selectOne<Pick<MemberRow, 'photo_path'>>(TABLES.members, {
      select: 'photo_path',
      filters: { id: `eq.${owner.memberId}` },
    });
    photoUrl = await signedUrl(member?.photo_path ?? null);
  }

  return { name: owner.name, photoUrl, role: 'EQUIPE' };
}

export async function getInviteContext(token: string): Promise<PublicInviteContext | null> {
  const resolved = await resolveInvite(token);
  if (!resolved) return null;

  const row = await selectOne<ClientRow>(TABLES.clients, {
    select: CLIENT_COLUMNS,
    filters: { id: `eq.${resolved.clientId}` },
  });
  if (!row) return null;

  const [fields, photo] = await Promise.all([loadFields([row.id]), signedUrl(row.photo_path)]);

  const client = toClient(row, {
    fields: fields.get(row.id) ?? [],
    // O estado exibido e o do proprio link, ja cruzado com o interruptor da
    // operacao pelo mapeador. O prazo vem do banco, no horario do servidor.
    invite: {
      active: resolved.active,
      status: resolved.state,
      issued_at: resolved.issuedAt,
      expires_at: resolved.expiresAt,
    },
    photoUrl: photo,
    inviteToken: token,
  });

  return {
    client,
    owner: resolved.owner,
    publicOwner: await publicOwner(resolved.owner, client.photo),
    accepts: inviteAccepts(resolved),
    finished: inviteFinished(resolved),
  };
}

export async function createClient(input: ClientInput): Promise<Client> {
  // O login do time usa o mesmo e-mail: conflito barra antes de gravar.
  await assertEmailAvailable(null, input.email);

  const photo = input.photo && isDataUrl(input.photo) ? await uploadImage('clients', input.photo) : null;

  const row = await insertOne<ClientRow>(TABLES.clients, {
    name: input.name.trim(),
    email: normalizeEmail(input.email),
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

  // O link pessoal nasce junto com o acesso do time, em
  // `createCandidateAccess`: e o usuario que da nome ao link.
  return assemble(row);
}

export async function updateClient(id: string, input: Partial<ClientInput>): Promise<Client> {
  const current = await requireClientRow(id);

  // Troca de e-mail sincroniza o login e derruba as sessoes antigas. O
  // conflito e conferido antes de qualquer gravacao.
  if (input.email !== undefined || input.name !== undefined) {
    if (input.email !== undefined) await assertEmailAvailable(id, input.email);
    await syncCandidateLogin(id, { name: input.name, email: input.email });
  }

  const patch: Record<string, string | number | null> = {};

  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.email !== undefined) patch.email = normalizeEmail(input.email);
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

  // Acesso desativado e sessoes revogadas antes da exclusao. A linha em
  // `cmd_users` sai junto pela cascata do banco.
  await disableCandidateAccess(id);

  // As fotos vivem no Storage: a exclusao em cascata do banco nao as alcanca.
  const members = await selectRows<Pick<MemberRow, 'photo_path'>>(TABLES.members, {
    select: 'photo_path',
    filters: { client_id: `eq.${id}` },
  });
  for (const member of members) await deleteImage(member.photo_path);
  await deleteImage(current.photo_path);

  await deleteRows(TABLES.clients, { id: `eq.${id}` });
}

/**
 * Campos padrao que nao podem deixar de ser obrigatorios ou ativos.
 *
 * A mesma regra existe na tela, mas quem decide e o servidor: alterar o
 * corpo da requisicao nao desativa nem torna opcional o e-mail.
 */
const LOCKED_REQUIRED: readonly string[] = ['name', 'email'];
const LOCKED_ENABLED: readonly string[] = ['name', 'phone', 'email'];

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
    // O `system_key` e sempre o gravado: o navegador nao transforma um campo
    // comum em campo padrao nem o contrario.
    const systemKey = current?.system_key ?? null;

    const values = {
      system_key: systemKey,
      type: systemKey ? current!.type : field.type,
      label: field.label,
      placeholder: field.placeholder,
      help_text: field.helpText,
      // Nome, e-mail e telefone continuam ativos, e nome e e-mail continuam
      // obrigatorios, venha o que vier no corpo da requisicao: o e-mail e o
      // que cria o acesso do integrante.
      required: LOCKED_REQUIRED.includes(systemKey ?? '') ? true : field.required,
      enabled: LOCKED_ENABLED.includes(systemKey ?? '') ? true : field.enabled,
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

/**
 * Liga ou desliga o recrutamento da operacao inteira.
 *
 * Desligado, TODOS os links daquele time param de aceitar cadastros:
 * o do proprio time e o de cada integrante.
 */
export async function setInviteActive(id: string, active: boolean): Promise<Client> {
  await requireClientRow(id);

  const [row] = await updateRows<ClientRow>(
    TABLES.clients,
    { id: `eq.${id}` },
    { recruiting_active: active },
  );

  // O link do proprio time acompanha o interruptor da operacao.
  const invites = await loadOperationInvites([id]);
  const invite = invites.get(id);
  if (invite) {
    await updateRows<InviteRow>(TABLES.invites, { id: `eq.${invite.id}` }, { active }, 'id');
  }

  return assemble(row ?? (await requireClientRow(id)));
}

/**
 * Gera um novo token para o link do time. O anterior deixa de valer;
 * os links pessoais dos integrantes continuam como estao.
 */
export async function regenerateInvite(id: string): Promise<Client> {
  const row = await requireClientRow(id);

  const invites = await loadOperationInvites([id]);
  const current = invites.get(id);

  if (current?.user_id) {
    await rotatePersonalInvite(current.user_id);
    return assemble(row);
  }

  // Time ainda sem usuario: o link so existe depois que o acesso e
  // criado em Configuracoes.
  const user = await selectOne<Pick<UserRow, 'id'>>(TABLES.users, {
    select: 'id',
    filters: { client_id: `eq.${id}`, role: 'eq.CANDIDATE' },
  });
  if (!user) throw notFound('Gere o acesso do time antes de criar o link.');

  await ensurePersonalInvite(user.id, id);
  await rotatePersonalInvite(user.id);
  return assemble(row);
}
