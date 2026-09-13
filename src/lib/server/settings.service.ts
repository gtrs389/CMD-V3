import 'server-only';
import type { InviteExpirationSettings, PublicEntrySettings } from '@/lib/types';
import {
  DEFAULT_INVITE_SECONDS,
  MAX_INVITE_SECONDS,
  MIN_INVITE_SECONDS,
} from '@/lib/domain/invite-expiration';
import { TABLES, type SettingsRow } from '@/lib/supabase/tables';
import { selectOne, updateRows } from '@/lib/supabase/rest';
import { badRequest } from './http';

/**
 * Configuracao global dos links.
 *
 * Exclusivo do ADMIN: as rotas exigem `settings.view` e `settings.manage`.
 * Nada daqui aparece na resposta publica do convite.
 */

const SETTINGS_COLUMNS =
  'id,candidate_invite_seconds,team_invite_seconds,public_redirect_url,public_link_origin,updated_at';

/**
 * Endereco aceito como destino: absoluto e http(s).
 *
 * O mesmo formato que o `check` da migration 024 exige. Sem isso, um valor
 * como `javascript:...` viraria um redirecionamento perigoso na tela
 * publica — e ela e aberta por qualquer pessoa.
 */
const URL_ACEITA = /^https?:\/\/[^\s]+$/;

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
   Entrada pelo dominio publico
   ------------------------------------------------------------------------- */

/**
 * Para onde mandar quem chega ao dominio publico sem um link valido.
 *
 * O dominio publico e o que vai nos links enviados: ele serve o formulario,
 * o questionario e o acesso do time, e nada mais. Quem tenta abrir o painel
 * por ele nao encontra a tela de login — vai para o endereco que o ADMIN
 * escolheu aqui.
 */
export async function getPublicEntry(): Promise<PublicEntrySettings> {
  const row = await selectOne<SettingsRow>(TABLES.settings, {
    select: SETTINGS_COLUMNS,
    filters: { id: 'eq.true' },
  });

  return {
    redirectUrl: row?.public_redirect_url ?? '',
    linkOrigin: row?.public_link_origin ?? '',
    updatedAt: row?.updated_at ?? new Date().toISOString(),
  };
}

/** Endereco sem caminho: so esquema, dominio e, quando houver, porta. */
const ORIGEM_ACEITA = /^https?:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?$/;

export interface PublicEntryInput {
  redirectUrl?: string;
  linkOrigin?: string;
}

/**
 * Grava a entrada pelo dominio publico.
 *
 * `redirectUrl` vazio desliga o redirecionamento; `linkOrigin` vazio manda
 * deduzir o endereco dos links a partir do proprio painel.
 */
export async function updatePublicEntry(input: PublicEntryInput): Promise<PublicEntrySettings> {
  const patch: Record<string, string> = { updated_at: new Date().toISOString() };

  if (input.redirectUrl !== undefined) {
    const destino = input.redirectUrl.trim();
    if (destino && !URL_ACEITA.test(destino)) {
      throw badRequest('Informe um endereço completo, começando com http:// ou https://.');
    }
    patch.public_redirect_url = destino;
  }

  if (input.linkOrigin !== undefined) {
    // Sem barra no fim: o caminho do link e concatenado direto.
    const origem = input.linkOrigin.trim().replace(/\/$/, '');
    if (origem && !ORIGEM_ACEITA.test(origem)) {
      throw badRequest('Informe apenas o endereço, como https://www.seudominio.com.br.');
    }
    patch.public_link_origin = origem;
  }

  const [row] = await updateRows<SettingsRow>(
    TABLES.settings,
    { id: 'eq.true' },
    patch,
    SETTINGS_COLUMNS,
  );

  return {
    redirectUrl: row?.public_redirect_url ?? '',
    linkOrigin: row?.public_link_origin ?? '',
    updatedAt: row?.updated_at ?? new Date().toISOString(),
  };
}

/*
 * O historico dos links deixou de morar aqui: ele virou o RASTREAMENTO
 * completo, em `invite-tracking.service.ts`, com dono, gerador, aparelho do
 * primeiro acesso e tempos entre as etapas.
 */
