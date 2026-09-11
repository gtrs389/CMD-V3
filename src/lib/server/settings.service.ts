import 'server-only';
import type { InviteExpirationSettings, InviteHistoryEntry } from '@/lib/types';
import {
  DEFAULT_INVITE_SECONDS,
  MAX_INVITE_SECONDS,
  MIN_INVITE_SECONDS,
  effectiveState,
  type InviteState,
} from '@/lib/domain/invite-expiration';
import {
  TABLES,
  type ClientRow,
  type InviteEventRow,
  type InviteRow,
  type SettingsRow,
} from '@/lib/supabase/tables';
import { callFunction, inFilter, selectOne, selectRows, updateRows } from '@/lib/supabase/rest';

/**
 * Configuracao global e historico dos links.
 *
 * Exclusivo do ADMIN: as rotas exigem `settings.view` e `settings.manage`.
 * Nada daqui aparece na resposta publica do convite.
 */

const SETTINGS_COLUMNS = 'id,candidate_invite_seconds,team_invite_seconds,updated_at';

/** Mantem o prazo dentro dos limites aceitos, no servidor. */
function clamp(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_INVITE_SECONDS;
  return Math.min(MAX_INVITE_SECONDS, Math.max(MIN_INVITE_SECONDS, Math.round(seconds)));
}

function toSettings(row: SettingsRow | null): InviteExpirationSettings {
  return {
    candidateSeconds: clamp(row?.candidate_invite_seconds ?? DEFAULT_INVITE_SECONDS),
    teamSeconds: clamp(row?.team_invite_seconds ?? DEFAULT_INVITE_SECONDS),
    updatedAt: row?.updated_at ?? new Date().toISOString(),
  };
}

/** Sem linha configurada, os dois prazos valem 24 horas. */
export async function getInviteExpiration(): Promise<InviteExpirationSettings> {
  const row = await selectOne<SettingsRow>(TABLES.settings, {
    select: SETTINGS_COLUMNS,
    filters: { id: 'eq.true' },
  });
  return toSettings(row);
}

export interface InviteExpirationInput {
  candidateSeconds: number;
  teamSeconds: number;
}

/**
 * Grava os dois prazos.
 *
 * A nova duracao vale para os proximos links gerados ou renovados: nenhum
 * link ja emitido tem o prazo alterado.
 */
export async function updateInviteExpiration(
  input: InviteExpirationInput,
): Promise<InviteExpirationSettings> {
  const [row] = await updateRows<SettingsRow>(
    TABLES.settings,
    { id: 'eq.true' },
    {
      candidate_invite_seconds: clamp(input.candidateSeconds),
      team_invite_seconds: clamp(input.teamSeconds),
      updated_at: new Date().toISOString(),
    },
    SETTINGS_COLUMNS,
  );
  return toSettings(row ?? null);
}

/* -------------------------------------------------------------------------
   Historico
   ------------------------------------------------------------------------- */

export interface InviteHistoryFilter {
  role?: 'CANDIDATE' | 'EQUIPE';
  state?: InviteState;
  /** Recorte por data de geracao, em ISO. */
  from?: string;
  to?: string;
}

const EVENT_COLUMNS =
  'id,invite_id,client_id,user_id,owner_name,owner_role,generation,event,occurred_at';

const INVITE_COLUMNS =
  'id,client_id,user_id,active,created_at,rotated_at,issued_at,expires_at,status,' +
  'claimed_at,consumed_at,revoked_at,generation';

/**
 * Historico completo dos links, montado a partir dos eventos imutaveis.
 *
 * Antes de ler, os vencidos passam a EXPIRED: o estado se atualiza na
 * consulta, sem cron. Nenhum token, segredo, senha, CPF ou IP e devolvido.
 */
export async function listInviteHistory(
  filter: InviteHistoryFilter = {},
): Promise<InviteHistoryEntry[]> {
  await callFunction<number>('cmd_invite_expire_due', {}).catch(() => undefined);

  const events = await selectRows<InviteEventRow>(TABLES.inviteEvents, {
    select: EVENT_COLUMNS,
    order: 'occurred_at.desc',
    limit: 2000,
  });
  if (events.length === 0) return [];

  const inviteIds = [...new Set(events.map((event) => event.invite_id))];
  const [invites, clients] = await Promise.all([
    selectRows<InviteRow>(TABLES.invites, {
      select: INVITE_COLUMNS,
      filters: { id: inFilter(inviteIds) },
    }),
    selectRows<Pick<ClientRow, 'id' | 'name'>>(TABLES.clients, {
      select: 'id,name',
      filters: { id: inFilter([...new Set(events.map((event) => event.client_id))]) },
    }),
  ]);

  const inviteById = new Map(invites.map((invite) => [invite.id, invite]));
  const clientName = new Map(clients.map((client) => [client.id, client.name]));

  /** Uma entrada por geracao do link. */
  const rows = new Map<string, InviteHistoryEntry>();

  for (const event of events) {
    const key = `${event.invite_id}:${event.generation}`;
    const invite = inviteById.get(event.invite_id);
    const current =
      rows.get(key) ??
      ({
        key,
        ownerName: event.owner_name ?? 'Acesso removido',
        ownerRole: event.owner_role,
        candidateName: clientName.get(event.client_id) ?? '--',
        generatedAt: null,
        firstAccessAt: null,
        expiresAt: null,
        consumedAt: null,
        revokedAt: null,
        // Geracao antiga, ja substituida, nao volta a ser ativa.
        state: 'REVOKED' as InviteState,
      } satisfies InviteHistoryEntry);

    if (event.event === 'GENERATED') current.generatedAt = event.occurred_at;
    if (event.event === 'CLAIMED') current.firstAccessAt = event.occurred_at;
    if (event.event === 'CONSUMED') current.consumedAt = event.occurred_at;
    if (event.event === 'REVOKED') current.revokedAt = event.occurred_at;

    // O prazo e o estado atuais pertencem a geracao corrente do link.
    if (invite && invite.generation === event.generation) {
      current.expiresAt = invite.expires_at;
      current.state = effectiveState(invite.status as InviteState, invite.expires_at);
    } else if (current.consumedAt) {
      current.state = 'CONSUMED';
    } else if (current.revokedAt) {
      current.state = 'REVOKED';
    } else if (current.state !== 'CONSUMED') {
      current.state = 'EXPIRED';
    }

    rows.set(key, current);
  }

  let list = [...rows.values()];

  if (filter.role) list = list.filter((row) => row.ownerRole === filter.role);
  if (filter.state) list = list.filter((row) => row.state === filter.state);
  if (filter.from) list = list.filter((row) => (row.generatedAt ?? '') >= filter.from!);
  if (filter.to) list = list.filter((row) => (row.generatedAt ?? '') <= filter.to!);

  // Mais recentes primeiro. Nenhum identificador interno vai para a tela.
  return list.sort((a, b) => (b.generatedAt ?? '').localeCompare(a.generatedAt ?? ''));
}
