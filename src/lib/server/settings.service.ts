import 'server-only';
import type { InviteExpirationSettings } from '@/lib/types';
import {
  DEFAULT_INVITE_SECONDS,
  MAX_INVITE_SECONDS,
  MIN_INVITE_SECONDS,
} from '@/lib/domain/invite-expiration';
import { TABLES, type SettingsRow } from '@/lib/supabase/tables';
import { selectOne, updateRows } from '@/lib/supabase/rest';

/**
 * Configuracao global dos links.
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

/*
 * O historico dos links deixou de morar aqui: ele virou o RASTREAMENTO
 * completo, em `invite-tracking.service.ts`, com dono, gerador, aparelho do
 * primeiro acesso e tempos entre as etapas.
 */
