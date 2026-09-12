import 'server-only';
import type {
  Client,
  ClientFormConfig,
  ClientInput,
  ClientSummary,
  CustomField,
  PublicInviteOwner,
  TeamPersonInput,
} from '@/lib/types';
import { appConfig } from '@/config/app.config';
import { createSystemFields } from '@/lib/domain/form-config';
import { normalizePhone } from '@/lib/utils/phone';
import {
  TABLES,
  type ClientRow,
  type FormFieldRow,
  type InviteRow,
  type MemberRow,
  type TeamPersonRow,
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
import {
  assertTeamPhoneAvailable,
  createTeamPersonUser,
  disableCandidateAccess,
  revokeTeamPersonUser,
  syncTeamPersonUser,
} from './user.service';
import { ensureTeamAccessLink } from './team-access.service';
import { badRequest, notFound } from './http';

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

/** Pessoas do time de um ou mais clientes, na ordem de cadastro. */
async function loadTeamPeople(clientIds: string[]): Promise<Map<string, TeamPersonRow[]>> {
  const grouped = new Map<string, TeamPersonRow[]>();
  if (clientIds.length === 0) return grouped;

  const rows = await selectRows<TeamPersonRow>(TABLES.teamPeople, {
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

async function requireClientRow(id: string): Promise<ClientRow> {
  const row = await selectOne<ClientRow>(TABLES.clients, {
    select: CLIENT_COLUMNS,
    filters: { id: `eq.${id}` },
  });
  if (!row) throw notFound('Time não encontrado.');
  return row;
}

async function assemble(row: ClientRow, inviteToken?: string | null): Promise<Client> {
  const [fields, invites, photo, people] = await Promise.all([
    loadFields([row.id]),
    loadInvites([row.id]),
    signedUrl(row.photo_path),
    loadTeamPeople([row.id]),
  ]);

  const peopleRows = people.get(row.id) ?? [];
  const peoplePhotos = await signedUrls(peopleRows.map((person) => person.photo_path));

  return toClient(row, {
    fields: fields.get(row.id) ?? [],
    invite: invites.get(row.id) ?? null,
    photoUrl: photo,
    inviteToken: inviteToken ?? null,
    people: peopleRows.map((personRow, index) => ({
      row: personRow,
      photoUrl: peoplePhotos[index] ?? null,
    })),
  });
}

export async function listClientSummaries(): Promise<ClientSummary[]> {
  const rows = await selectRows<ClientRow>(TABLES.clients, {
    select: CLIENT_COLUMNS,
    order: 'created_at.desc',
  });
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const [fields, invites, photos, members, people] = await Promise.all([
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
    loadTeamPeople(ids),
  ]);

  // Pilha de fotos das pessoas do time: as primeiras da ordem de cadastro.
  const peopleById = new Map(
    [...people.entries()].map(([clientId, personRows]) => [
      clientId,
      { total: personRows.length, preview: personRows.slice(0, RECENT_MEMBERS) },
    ]),
  );
  const peoplePreviewRows = [...peopleById.values()].flatMap((entry) => entry.preview);
  const peoplePreviewPhotos = await signedUrls(
    peoplePreviewRows.map((person) => person.photo_path),
  );
  const peoplePhotoById = new Map(
    peoplePreviewRows.map((person, index) => [person.id, peoplePreviewPhotos[index] ?? null]),
  );

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
      teamPeopleCount: peopleById.get(row.id)?.total ?? 0,
      teamPeoplePreview: (peopleById.get(row.id)?.preview ?? []).map((person) => ({
        id: person.id,
        name: person.name,
        photo: peoplePhotoById.get(person.id) ?? null,
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

function normalizeTeamPersonName(name: string): string {
  return (name ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Recusa dois administradores com o mesmo telefone dentro do mesmo time.
 *
 * A conferencia roda ANTES de gravar qualquer coisa: o banco tambem tem o
 * indice unico, mas aqui a mensagem chega pronta para a tela.
 */
function assertPhonesUnique(people: TeamPersonInput[]): void {
  const vistos = new Set<string>();
  for (const person of people) {
    const phone = normalizePhone(person.phone);
    if (vistos.has(phone)) {
      throw badRequest('Telefone repetido entre os administradores deste time.');
    }
    vistos.add(phone);
  }
}

/**
 * Insere as pessoas do time de um cliente recem-criado, na ordem recebida, e
 * cria a identidade de acesso de cada uma (link do time + telefone).
 *
 * Falha no meio da lista desfaz as fotos ja enviadas nesta chamada: nenhum
 * arquivo fica orfao no bucket, mesmo que a pessoa correspondente nao tenha
 * sido gravada.
 */
async function insertTeamPeople(clientId: string, people: TeamPersonInput[]): Promise<void> {
  if (people.length === 0) return;

  assertPhonesUnique(people);

  const uploadedPaths: string[] = [];
  const rows: Record<string, string | number | null>[] = [];

  try {
    for (const [index, person] of people.entries()) {
      const photo =
        person.photo && isDataUrl(person.photo)
          ? await uploadImage('team-people', person.photo)
          : null;
      if (photo) uploadedPaths.push(photo.path);

      rows.push({
        client_id: clientId,
        name: normalizeTeamPersonName(person.name),
        phone: normalizePhone(person.phone),
        photo_path: photo?.path ?? null,
        photo_mime: photo?.mime ?? null,
        photo_size: photo?.size ?? null,
        position: index,
      });
    }

    const inserted = await insertRows<TeamPersonRow>(TABLES.teamPeople, rows, 'id,name,phone');
    for (const person of inserted) {
      await createTeamPersonUser({
        clientId,
        personId: person.id,
        name: person.name,
        phone: person.phone,
      });
    }
  } catch (error) {
    for (const path of uploadedPaths) await deleteImage(path).catch(() => undefined);
    throw error;
  }
}

/**
 * Sincroniza as pessoas do time de um cliente existente: atualiza quem ja
 * existe (pelo `id` enviado), cria quem e novo e remove quem faltar na
 * lista, sempre preservando a ordem recebida em `position`.
 *
 * A foto nova e enviada antes de qualquer gravacao trocar de dono; a antiga
 * so e removida do bucket depois que a troca for salva com sucesso. Falha no
 * meio do processo nao deixa nenhuma foto recem-enviada orfa.
 */
async function syncTeamPeople(clientId: string, people: TeamPersonInput[]): Promise<void> {
  assertPhonesUnique(people);

  const existing = await selectRows<TeamPersonRow>(TABLES.teamPeople, {
    select: '*',
    filters: { client_id: `eq.${clientId}` },
  });
  const byId = new Map(existing.map((row) => [row.id, row]));
  const keptIds = new Set<string>();
  const uploadedPaths: string[] = [];

  // Telefone em uso por outro administrador do mesmo time para a edicao
  // antes de qualquer gravacao.
  for (const person of people) {
    await assertTeamPhoneAvailable(clientId, person.phone, { personId: person.id });
  }

  try {
    for (const [index, person] of people.entries()) {
      const current = person.id ? byId.get(person.id) : undefined;

      let photo: { path: string; mime: string; size: number } | null = null;
      if (person.photo && isDataUrl(person.photo)) {
        photo = await uploadImage('team-people', person.photo);
        uploadedPaths.push(photo.path);
      }

      const values: Record<string, string | number | null> = {
        name: normalizeTeamPersonName(person.name),
        phone: normalizePhone(person.phone),
        position: index,
      };

      if (person.photo === null) {
        values.photo_path = null;
        values.photo_mime = null;
        values.photo_size = null;
      } else if (photo) {
        values.photo_path = photo.path;
        values.photo_mime = photo.mime;
        values.photo_size = photo.size;
      }
      // Nenhum dos dois: a foto (URL assinada devolvida antes) continua a mesma.

      if (current) {
        keptIds.add(current.id);
        await updateRows<TeamPersonRow>(TABLES.teamPeople, { id: `eq.${current.id}` }, values, 'id');
        // Identidade de acesso acompanha o cadastro: trocar o telefone
        // derruba na hora as sessoes daquela pessoa.
        await syncTeamPersonUser({
          clientId,
          personId: current.id,
          name: String(values.name),
          phone: String(values.phone),
        });
        // So remove a foto antiga depois que a troca foi salva com sucesso.
        if ((person.photo === null || photo) && current.photo_path) {
          await deleteImage(current.photo_path);
        }
      } else {
        const [inserted] = await insertRows<TeamPersonRow>(
          TABLES.teamPeople,
          [{ client_id: clientId, ...values }],
          'id',
        );
        if (inserted) {
          keptIds.add(inserted.id);
          await createTeamPersonUser({
            clientId,
            personId: inserted.id,
            name: String(values.name),
            phone: String(values.phone),
          });
        }
      }
    }
  } catch (error) {
    for (const path of uploadedPaths) await deleteImage(path).catch(() => undefined);
    throw error;
  }

  // Pessoas removidas: fora da lista enviada por quem salvou. As sessoes
  // caem antes da exclusao e o usuario sai junto, pela cascata do banco;
  // os snapshots de quem ela cadastrou permanecem. Remover uma pessoa nunca
  // alcanca o time nem os integrantes recrutados.
  const removable = existing.filter((row) => !keptIds.has(row.id));
  for (const row of removable) {
    await revokeTeamPersonUser(row.id);
    await deleteImage(row.photo_path);
  }
  if (removable.length > 0) {
    await deleteRows(TABLES.teamPeople, { id: inFilter(removable.map((row) => row.id)) });
  }
}

export async function createClient(input: ClientInput): Promise<Client> {
  // Time sem administrador nao teria como ser acessado por ninguem.
  if (!input.people?.length) {
    throw badRequest('Cadastre pelo menos um administrador do time.');
  }

  const photo = input.photo && isDataUrl(input.photo) ? await uploadImage('clients', input.photo) : null;

  const row = await insertOne<ClientRow>(TABLES.clients, {
    name: input.name.trim(),
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

  // Cada administrador vira um usuario proprio, com o proprio link pessoal
  // de recrutamento.
  await insertTeamPeople(row.id, input.people);

  // Os dois enderecos de acesso nascem junto com o time: um para os
  // Administradores, outro para a equipe.
  await ensureTeamAccessLink(row.id, 'TEAM_ADMIN');
  await ensureTeamAccessLink(row.id, 'EQUIPE');

  return assemble(row);
}

export async function updateClient(id: string, input: Partial<ClientInput>): Promise<Client> {
  const current = await requireClientRow(id);

  const patch: Record<string, string | number | null> = {};

  if (input.name !== undefined) patch.name = input.name.trim();
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

  if (input.people !== undefined) await syncTeamPeople(id, input.people);

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

  const people = await selectRows<Pick<TeamPersonRow, 'photo_path'>>(TABLES.teamPeople, {
    select: 'photo_path',
    filters: { client_id: `eq.${id}` },
  });
  for (const person of people) await deleteImage(person.photo_path);

  await deleteImage(current.photo_path);

  await deleteRows(TABLES.clients, { id: `eq.${id}` });
}

/**
 * Campos padrao que nao podem deixar de ser obrigatorios ou ativos.
 *
 * A mesma regra existe na tela, mas quem decide e o servidor: alterar o
 * corpo da requisicao nao desativa nem torna opcional o telefone, que e o
 * que da acesso ao integrante junto do link do time.
 *
 * O campo padrao E-mail nao aparece aqui nem chega nesta lista: ele sai da
 * configuracao antes (ver `toFormConfig`) e permanece desativado no banco.
 */
const LOCKED_REQUIRED: readonly string[] = ['name', 'phone'];
const LOCKED_ENABLED: readonly string[] = ['name', 'phone'];

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
      // Nome e telefone continuam ativos e obrigatorios, venha o que vier no
      // corpo da requisicao: o telefone e o que cria o acesso do integrante.
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
 *
 * `generatedByUserId` e quem clicou — normalmente o ADMIN geral agindo em
 * nome do Administrador do time. O DONO do link continua sendo o
 * administrador do time, e e o nome dele que permanece em "Cadastrado por".
 */
export async function regenerateInvite(
  id: string,
  generatedByUserId?: string | null,
): Promise<Client> {
  const row = await requireClientRow(id);

  // O link do time e sempre emitido por um administrador ATIVO, e nunca pelo
  // dono do convite mais antigo: esse dono pode ser o acesso antigo do time
  // (e-mail e senha), desativado na migration 016. Emitir por ele falha no
  // banco com "usuario inativo", e era assim que a geracao parava sem dizer
  // por que.
  const user = await selectOne<Pick<UserRow, 'id'>>(TABLES.users, {
    select: 'id',
    filters: { client_id: `eq.${id}`, role: 'eq.CANDIDATE', is_active: 'is.true' },
    order: 'created_at.asc',
  });
  if (!user) throw notFound('Cadastre um administrador do time antes de criar o link.');

  // Sem link proprio ainda, o administrador adota o convite sem dono da
  // operacao: o endereco ja distribuido continua valendo ate a renovacao.
  await ensurePersonalInvite(user.id, id, generatedByUserId);
  await rotatePersonalInvite(user.id, generatedByUserId);
  return assemble(row);
}
