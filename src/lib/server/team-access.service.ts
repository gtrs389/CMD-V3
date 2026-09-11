import 'server-only';
import type { SessionUser, TeamAccessLink } from '@/lib/types';
import { createToken, hashToken } from '@/lib/auth/tokens';
import { SESSION_MAX_AGE } from '@/lib/auth/constants';
import { normalizePhone } from '@/lib/utils/phone';
import {
  TABLES,
  type ClientRow,
  type SessionRow,
  type TeamAccessLinkRow,
  type UserRow,
} from '@/lib/supabase/tables';
import { insertOne, selectOne, selectRows, updateRows } from '@/lib/supabase/rest';
import { signedUrl } from '@/lib/supabase/storage';
import { revokeUserSessions } from './user.service';

/**
 * Acesso administrativo do time: link proprio + telefone.
 *
 * Este link NAO e o de recrutamento (`cmd_invites`): ele nao expira sozinho,
 * nao e reservado por navegador, nao e consumido no primeiro uso e vale para
 * todos os administradores ativos daquele time. So o ADMIN geral consulta,
 * copia e renova.
 *
 * O telefone nao e senha: sem o link correto ele nao autentica ninguem. Por
 * isso o limite de tentativas vive no proprio link, e nem telefone, nem
 * token, nem URL completa aparecem em log.
 */

/** Tentativas erradas seguidas no mesmo link antes do bloqueio. */
const MAX_ACCESS_ATTEMPTS = 10;

/** Duracao do bloqueio do link, em minutos. */
const ACCESS_LOCK_MINUTES = 15;

/** Token de 256 bits em base64url: alta entropia, seguro para URL. */
function createAccessToken(): string {
  return createToken(32);
}

function toAccessLink(row: TeamAccessLinkRow): TeamAccessLink {
  return {
    token: row.token,
    active: row.active,
    createdAt: row.created_at,
    rotatedAt: row.rotated_at,
  };
}

export async function findAccessLinkRow(clientId: string): Promise<TeamAccessLinkRow | null> {
  return selectOne<TeamAccessLinkRow>(TABLES.teamAccessLinks, {
    select: '*',
    filters: { client_id: `eq.${clientId}` },
  });
}

/** Cria o link do time quando ainda nao existe. Idempotente. */
export async function ensureTeamAccessLink(clientId: string): Promise<TeamAccessLinkRow> {
  const current = await findAccessLinkRow(clientId);
  if (current) return current;

  const token = createAccessToken();
  return insertOne<TeamAccessLinkRow>(
    TABLES.teamAccessLinks,
    { client_id: clientId, token, token_hash: hashToken(token), active: true },
    '*',
  );
}

/** Link atual do time, para o ADMIN geral copiar. Cria se ainda nao existir. */
export async function getTeamAccessLink(clientId: string): Promise<TeamAccessLink> {
  return toAccessLink(await ensureTeamAccessLink(clientId));
}

/** Revoga as sessoes de todos os administradores daquele time. */
async function revokeTeamAdminSessions(clientId: string): Promise<void> {
  const admins = await selectRows<Pick<UserRow, 'id'>>(TABLES.users, {
    select: 'id',
    filters: { client_id: `eq.${clientId}`, role: 'eq.CANDIDATE' },
  });
  for (const admin of admins) await revokeUserSessions(admin.id);
}

/**
 * Gera um endereco novo. O anterior para de funcionar na hora e todas as
 * sessoes abertas dos administradores daquele time caem junto.
 */
export async function rotateTeamAccessLink(clientId: string): Promise<TeamAccessLink> {
  const current = await ensureTeamAccessLink(clientId);
  const token = createAccessToken();

  const [row] = await updateRows<TeamAccessLinkRow>(
    TABLES.teamAccessLinks,
    { id: `eq.${current.id}` },
    {
      token,
      token_hash: hashToken(token),
      active: true,
      failed_attempts: 0,
      locked_until: null,
      rotated_at: new Date().toISOString(),
    },
    '*',
  );

  await revokeTeamAdminSessions(clientId);
  return toAccessLink(row ?? { ...current, token, token_hash: hashToken(token) });
}

/* -------------------------------------------------------------------------
   Pagina publica de acesso
   ------------------------------------------------------------------------- */

export interface TeamAccessContext {
  clientId: string;
  /** Nome do time exibido na tela. Nenhum telefone ou nome de pessoa sai daqui. */
  clientName: string;
}

/**
 * Resolve o token do link para o time correspondente.
 *
 * Link inexistente, revogado ou de um time que nao existe mais devolve
 * `null`: a tela mostra sempre a mesma mensagem neutra.
 */
export async function resolveTeamAccess(token: string): Promise<TeamAccessContext | null> {
  if (!token || token.length < 16) return null;

  const link = await selectOne<TeamAccessLinkRow>(TABLES.teamAccessLinks, {
    select: '*',
    filters: { token_hash: `eq.${hashToken(token)}` },
  });
  if (!link || !link.active) return null;

  const client = await selectOne<Pick<ClientRow, 'id' | 'name'>>(TABLES.clients, {
    select: 'id,name',
    filters: { id: `eq.${link.client_id}` },
  });
  if (!client) return null;

  return { clientId: client.id, clientName: client.name };
}

export interface TeamLoginOutcome {
  user: SessionUser | null;
  /** Token bruto da sessao. So existe quando o acesso foi aceito. */
  sessionToken: string | null;
  message: string | null;
  /** Bloqueio temporario do link por tentativas repetidas. */
  throttled: boolean;
}

/** Mesma resposta para telefone inexistente, inativo ou de outro time. */
const GENERIC_PHONE_ERROR = 'Telefone não autorizado para este time.';

/** Link inexistente, revogado ou substituido. */
export const GENERIC_LINK_ERROR = 'Este link de acesso não está disponível.';

function linkIsLocked(link: TeamAccessLinkRow): boolean {
  return link.locked_until !== null && new Date(link.locked_until).getTime() > Date.now();
}

async function registerAccessFailure(link: TeamAccessLinkRow): Promise<void> {
  const attempts = link.failed_attempts + 1;
  const locked =
    attempts >= MAX_ACCESS_ATTEMPTS
      ? new Date(Date.now() + ACCESS_LOCK_MINUTES * 60_000).toISOString()
      : null;

  await updateRows<TeamAccessLinkRow>(
    TABLES.teamAccessLinks,
    { id: `eq.${link.id}` },
    { failed_attempts: attempts, locked_until: locked },
    'id',
  );
}

/**
 * Entrada do administrador do time: link + telefone.
 *
 * O telefone e comparado somente na forma normalizada e apenas dentro do
 * time que o link identificou. Nenhum telefone, token ou URL vai para log, e
 * a resposta e sempre a mesma para qualquer telefone que nao sirva.
 */
export async function loginWithTeamPhone(
  token: string,
  rawPhone: string,
): Promise<TeamLoginOutcome> {
  const link = token
    ? await selectOne<TeamAccessLinkRow>(TABLES.teamAccessLinks, {
        select: '*',
        filters: { token_hash: `eq.${hashToken(token)}` },
      })
    : null;

  if (!link || !link.active) {
    return { user: null, sessionToken: null, message: GENERIC_LINK_ERROR, throttled: false };
  }

  if (linkIsLocked(link)) {
    return {
      user: null,
      sessionToken: null,
      message: `Muitas tentativas. Tente novamente em ${ACCESS_LOCK_MINUTES} minutos.`,
      throttled: true,
    };
  }

  const phone = normalizePhone(rawPhone);
  if (phone.length < 10) {
    await registerAccessFailure(link);
    return { user: null, sessionToken: null, message: GENERIC_PHONE_ERROR, throttled: false };
  }

  const user = await selectOne<UserRow>(TABLES.users, {
    select: '*',
    filters: {
      client_id: `eq.${link.client_id}`,
      role: 'eq.CANDIDATE',
      phone: `eq.${phone}`,
    },
  });

  if (!user || !user.is_active || !user.team_person_id) {
    await registerAccessFailure(link);
    return { user: null, sessionToken: null, message: GENERIC_PHONE_ERROR, throttled: false };
  }

  const sessionToken = createToken();
  await insertOne<SessionRow>(
    TABLES.sessions,
    {
      user_id: user.id,
      token_hash: hashToken(sessionToken),
      expires_at: new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString(),
    },
    'id',
  );

  await updateRows<UserRow>(
    TABLES.users,
    { id: `eq.${user.id}` },
    { failed_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() },
    'id',
  );

  // Tentativas zeradas: o link voltou a ser usado com sucesso.
  if (link.failed_attempts > 0 || link.locked_until) {
    await updateRows<TeamAccessLinkRow>(
      TABLES.teamAccessLinks,
      { id: `eq.${link.id}` },
      { failed_attempts: 0, locked_until: null },
      'id',
    );
  }

  const photo = await teamPersonPhoto(user.team_person_id);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      photo,
      role: 'CANDIDATE',
      candidateId: user.client_id,
      memberId: null,
      mustChangePassword: false,
    },
    sessionToken,
    message: null,
    throttled: false,
  };
}

/** Foto do administrador do time, ja assinada. */
export async function teamPersonPhoto(teamPersonId: string | null): Promise<string | null> {
  if (!teamPersonId) return null;
  const person = await selectOne<{ photo_path: string | null }>(TABLES.teamPeople, {
    select: 'photo_path',
    filters: { id: `eq.${teamPersonId}` },
  });
  return signedUrl(person?.photo_path ?? null);
}
