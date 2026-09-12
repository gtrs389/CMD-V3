import 'server-only';
import type {
  InviteAccessDevice,
  InviteClickEntry,
  InviteTrackingEntry,
  InviteTrackingMember,
} from '@/lib/types';
import { effectiveState, type InviteState } from '@/lib/domain/invite-expiration';
import { elapsedMs } from '@/lib/domain/invite-tracking';
import {
  TABLES,
  type ClientRow,
  type InviteAccessDeviceRow,
  type InviteClickAttemptRow,
  type InviteEventRow,
  type InviteRow,
  type MemberRow,
} from '@/lib/supabase/tables';
import { callFunction, inFilter, selectRows } from '@/lib/supabase/rest';
import { signedUrls } from '@/lib/supabase/storage';
import { normalizeSearch } from '@/lib/utils/text';

/**
 * Rastreamento dos links de CADASTRO/RECRUTAMENTO.
 *
 * Exclusivo do ADMIN geral: a rota confere `settings.view` e o perfil ADMIN
 * antes de chamar qualquer coisa daqui. Administrador do time e EQUIPE nao
 * enxergam nem o proprio historico por este caminho.
 *
 * A fonte da verdade e o historico imutavel de `cmd_invite_events`, agrupado
 * por geracao (`invite_ref` + `generation`). O convite em si, quando ainda
 * existe, contribui apenas com o prazo e o estado corrente. Por isso a
 * auditoria continua completa mesmo depois de o dono, o gerador ou o
 * integrante serem excluidos: os identificadores viram nulos e os snapshots
 * de nome e perfil permanecem.
 *
 * Nao existe cron: o estado derivado e atualizado NA CONSULTA, com o horario
 * do banco (`cmd_invite_expire_due`), antes de ler os eventos.
 *
 * O que nunca sai daqui: token em claro, URL do convite, hash do token, hash
 * do IP, segredo da reserva, CPF, titulo de eleitor ou retorno de consulta
 * cadastral. As colunas correspondentes nem entram nos `select`.
 */

const EVENT_COLUMNS =
  'id,invite_id,invite_ref,client_id,user_id,owner_name,owner_role,generation,event,' +
  'occurred_at,generated_by_user_id,generated_by_name,generated_by_role,member_id';

const INVITE_COLUMNS =
  'id,client_id,user_id,active,created_at,rotated_at,issued_at,expires_at,status,' +
  'claimed_at,consumed_at,revoked_at,generation,owner_name,owner_role,' +
  'generated_by_user_id,generated_by_name,generated_by_role,member_id';

/** Sem `ip_hash`: o HMAC do IP nunca chega ao navegador. */
const DEVICE_COLUMNS =
  'invite_ref,generation,first_access_at,user_agent,accept_language,device_type,browser,os,' +
  'platform,screen_width,screen_height,timezone,languages,max_touch_points';

/** Sem `ip_hash`: o HMAC do IP nunca chega ao navegador. */
const CLICK_COLUMNS =
  'id,invite_ref,generation,kind,click_number,occurred_at,link_status,outcome,' +
  'user_agent,accept_language,device_type,browser,os,platform,screen_width,screen_height,' +
  'viewport_width,viewport_height,timezone,languages,max_touch_points';

/** Teto de leitura, igual ao do historico anterior. */
const EVENT_LIMIT = 2000;

/** Teto de aberturas lidas por consulta. */
const CLICK_LIMIT = 5000;

export interface InviteTrackingFilter {
  /** Time (operacao). */
  clientId?: string;
  /** Dono do link, pelo nome exibido. */
  owner?: string;
  role?: 'CANDIDATE' | 'EQUIPE';
  /** Quem executou a geracao, pelo nome exibido. */
  generatedBy?: string;
  state?: InviteState;
  /** Recorte por data de geracao, em ISO. */
  from?: string;
  to?: string;
}

type Role = 'ADMIN' | 'CANDIDATE' | 'EQUIPE';

/** Acumulador de uma geracao enquanto os eventos sao percorridos. */
interface Draft {
  key: string;
  generation: number;
  inviteRef: string;
  clientId: string;
  ownerName: string;
  ownerRole: Role | null;
  generatedByName: string | null;
  generatedByRole: Role | null;
  generatedAt: string | null;
  firstAccessAt: string | null;
  consumedAt: string | null;
  expiredAt: string | null;
  revokedAt: string | null;
  memberId: string | null;
}

function toDevice(row: InviteAccessDeviceRow): InviteAccessDevice {
  return {
    deviceType: row.device_type,
    browser: row.browser,
    os: row.os,
    platform: row.platform,
    userAgent: row.user_agent,
    screenWidth: row.screen_width,
    screenHeight: row.screen_height,
    timezone: row.timezone,
    // Sem a complementacao da pagina, vale o idioma do cabecalho lido no
    // primeiro clique.
    languages: row.languages ?? row.accept_language,
    maxTouchPoints: row.max_touch_points,
    firstAccessAt: row.first_access_at,
  };
}

function toClick(row: InviteClickAttemptRow): InviteClickEntry {
  return {
    id: row.id,
    clickNumber: row.click_number,
    preview: row.kind === 'PREVIEW',
    occurredAt: row.occurred_at,
    linkStatus: row.link_status as InviteState,
    outcome: row.outcome,
    deviceType: row.device_type,
    browser: row.browser,
    os: row.os,
    platform: row.platform,
    userAgent: row.user_agent,
    screenWidth: row.screen_width,
    screenHeight: row.screen_height,
    viewportWidth: row.viewport_width,
    viewportHeight: row.viewport_height,
    timezone: row.timezone,
    // Sem a complementacao da pagina, vale o idioma do cabecalho.
    languages: row.languages ?? row.accept_language,
    maxTouchPoints: row.max_touch_points,
  };
}

/**
 * Estado derivado da geracao.
 *
 * A geracao CORRENTE do convite usa o estado do banco, ja corrigido pelo
 * prazo. Geracao antiga nunca volta a ser ativa: ela terminou em conclusao,
 * revogacao ou vencimento.
 */
function stateOf(draft: Draft, invite: InviteRow | undefined): InviteState {
  if (invite && invite.generation === draft.generation) {
    return effectiveState(invite.status as InviteState, invite.expires_at);
  }
  if (draft.consumedAt) return 'CONSUMED';
  if (draft.revokedAt) return 'REVOKED';
  return 'EXPIRED';
}

/** Comparacao tolerante a acento e caixa, com o mesmo normalizador da busca. */
function sameName(value: string, filter: string): boolean {
  return normalizeSearch(value) === normalizeSearch(filter);
}

export async function listInviteTracking(
  filter: InviteTrackingFilter = {},
): Promise<InviteTrackingEntry[]> {
  // Estado derivado atualizado na consulta, pelo horario do banco.
  await callFunction<number>('cmd_invite_expire_due', {}).catch(() => undefined);

  const events = await selectRows<InviteEventRow>(TABLES.inviteEvents, {
    select: EVENT_COLUMNS,
    order: 'occurred_at.desc',
    limit: EVENT_LIMIT,
  });
  if (events.length === 0) return [];

  const drafts = new Map<string, Draft>();

  for (const event of events) {
    const ref = event.invite_ref ?? event.invite_id;
    if (!ref) continue;

    const key = `${ref}:${event.generation}`;
    const draft =
      drafts.get(key) ??
      ({
        key,
        generation: event.generation,
        inviteRef: ref,
        clientId: event.client_id,
        ownerName: event.owner_name ?? 'Acesso removido',
        ownerRole: event.owner_role,
        generatedByName: null,
        generatedByRole: null,
        generatedAt: null,
        firstAccessAt: null,
        consumedAt: null,
        expiredAt: null,
        revokedAt: null,
        memberId: null,
      } satisfies Draft);

    // O snapshot do dono vale a partir de qualquer evento da geracao.
    if (event.owner_name) draft.ownerName = event.owner_name;
    if (event.owner_role) draft.ownerRole = event.owner_role;
    if (event.member_id) draft.memberId = event.member_id;

    switch (event.event) {
      case 'GENERATED':
        draft.generatedAt = event.occurred_at;
        // Quem gerou e o que consta no evento de geracao, e mais nenhum.
        draft.generatedByName = event.generated_by_name;
        draft.generatedByRole = event.generated_by_role;
        break;
      case 'CLAIMED':
        draft.firstAccessAt = event.occurred_at;
        break;
      case 'CONSUMED':
        draft.consumedAt = event.occurred_at;
        break;
      case 'EXPIRED':
        draft.expiredAt = event.occurred_at;
        break;
      case 'REVOKED':
        draft.revokedAt = event.occurred_at;
        break;
    }

    drafts.set(key, draft);
  }

  const list = [...drafts.values()];
  const refs = [...new Set(list.map((draft) => draft.inviteRef))];
  const clientIds = [...new Set(list.map((draft) => draft.clientId))];

  const [invites, clients, devices, clickRows] = await Promise.all([
    selectRows<InviteRow>(TABLES.invites, {
      select: INVITE_COLUMNS,
      filters: { id: inFilter(refs) },
    }),
    selectRows<Pick<ClientRow, 'id' | 'name'>>(TABLES.clients, {
      select: 'id,name',
      filters: { id: inFilter(clientIds) },
    }),
    selectRows<InviteAccessDeviceRow>(TABLES.inviteAccessDevices, {
      select: DEVICE_COLUMNS,
      filters: { invite_ref: inFilter(refs) },
    }),
    // Todas as aberturas daquelas geracoes, da mais antiga para a mais nova.
    selectRows<InviteClickAttemptRow>(TABLES.inviteClickAttempts, {
      select: CLICK_COLUMNS,
      filters: { invite_ref: inFilter(refs) },
      order: 'occurred_at.asc',
      limit: CLICK_LIMIT,
    }),
  ]);

  const inviteById = new Map(invites.map((row) => [row.id, row]));
  const clientName = new Map(clients.map((row) => [row.id, row.name]));
  const deviceByKey = new Map(
    devices.map((row) => [`${row.invite_ref}:${row.generation}`, row]),
  );

  const clicksByKey = new Map<string, InviteClickEntry[]>();
  for (const row of clickRows) {
    const chave = `${row.invite_ref}:${row.generation}`;
    const lista = clicksByKey.get(chave);
    if (lista) lista.push(toClick(row));
    else clicksByKey.set(chave, [toClick(row)]);
  }

  // O convite corrente tambem conhece o integrante criado: serve para as
  // conclusoes anteriores a esta migration, cujo evento nao guardou o
  // vinculo.
  for (const draft of list) {
    if (draft.memberId) continue;
    const invite = inviteById.get(draft.inviteRef);
    if (invite && invite.generation === draft.generation && invite.member_id) {
      draft.memberId = invite.member_id;
    }
  }

  const memberIds = [
    ...new Set(list.map((draft) => draft.memberId).filter((id): id is string => Boolean(id))),
  ];

  const memberRows = memberIds.length
    ? await selectRows<Pick<MemberRow, 'id' | 'client_id' | 'name' | 'phone' | 'photo_path'>>(
        TABLES.members,
        { select: 'id,client_id,name,phone,photo_path', filters: { id: inFilter(memberIds) } },
      )
    : [];

  const photos = await signedUrls(memberRows.map((row) => row.photo_path));
  const memberById = new Map<string, InviteTrackingMember>(
    memberRows.map((row, index) => [
      row.id,
      {
        id: row.id,
        clientId: row.client_id,
        name: row.name,
        phone: row.phone,
        photoUrl: photos[index] ?? null,
      },
    ]),
  );

  let entries: InviteTrackingEntry[] = list.map((draft) => {
    const invite = inviteById.get(draft.inviteRef);
    const corrente = invite && invite.generation === draft.generation ? invite : undefined;
    const state = stateOf(draft, invite);

    const clicks = clicksByKey.get(draft.key) ?? [];
    // Pre-visualizacao automatica nao e gente: ela nao entra na contagem nem
    // define o primeiro e o ultimo clique.
    const humanos = clicks.filter((clique) => !clique.preview);

    return {
      key: draft.key,
      generation: draft.generation,
      ownerName: draft.ownerName,
      ownerRole: draft.ownerRole,
      clientId: draft.clientId,
      clientName: clientName.get(draft.clientId) ?? '--',
      // Sem registro proprio (link anterior a esta migration), quem gerou e o
      // proprio dono: era o unico caminho possivel.
      generatedByName: draft.generatedByName ?? draft.ownerName,
      generatedByRole: draft.generatedByRole ?? draft.ownerRole,
      generatedAt: draft.generatedAt,
      expiresAt: corrente?.expires_at ?? null,
      firstAccessAt: draft.firstAccessAt,
      consumedAt: draft.consumedAt,
      expiredAt: draft.expiredAt,
      revokedAt: draft.revokedAt,
      state,
      msToFirstAccess: elapsedMs(draft.generatedAt, draft.firstAccessAt),
      msToConsume: elapsedMs(draft.firstAccessAt, draft.consumedAt),
      msTotal: elapsedMs(draft.generatedAt, draft.consumedAt),
      device: deviceByKey.get(draft.key) ? toDevice(deviceByKey.get(draft.key)!) : null,
      clicks,
      humanClicks: humanos.length,
      firstClickAt: humanos[0]?.occurredAt ?? null,
      lastClickAt: humanos[humanos.length - 1]?.occurredAt ?? null,
      // A pessoa so aparece depois da conclusao.
      member: state === 'CONSUMED' && draft.memberId
        ? (memberById.get(draft.memberId) ?? null)
        : null,
    } satisfies InviteTrackingEntry;
  });

  if (filter.clientId) entries = entries.filter((row) => row.clientId === filter.clientId);
  if (filter.owner) entries = entries.filter((row) => sameName(row.ownerName, filter.owner!));
  if (filter.role) entries = entries.filter((row) => row.ownerRole === filter.role);
  if (filter.generatedBy) {
    entries = entries.filter((row) => sameName(row.generatedByName, filter.generatedBy!));
  }
  if (filter.state) {
    // "Cadastro em andamento" cobre CLAIMED e SUBMITTING, que tem o mesmo rotulo.
    const alvo = filter.state === 'CLAIMED' ? ['CLAIMED', 'SUBMITTING'] : [filter.state];
    entries = entries.filter((row) => alvo.includes(row.state));
  }
  if (filter.from) entries = entries.filter((row) => (row.generatedAt ?? '') >= filter.from!);
  if (filter.to) entries = entries.filter((row) => (row.generatedAt ?? '') <= filter.to!);

  // Mais recentes primeiro.
  return entries.sort((a, b) => (b.generatedAt ?? '').localeCompare(a.generatedAt ?? ''));
}
