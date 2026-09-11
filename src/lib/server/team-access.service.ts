import 'server-only';
import type { NextRequest } from 'next/server';
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
import type { DeviceSignalsInput } from '@/lib/validation/server.schema';
import { bindAdminDevice } from './admin-device';
import { revokeUserSessions } from './user.service';

/**
 * Acesso ao sistema pelo link do time: link proprio + telefone.
 *
 * O MESMO link atende os dois perfis daquele time:
 *
 *   Administrador do time (CANDIDATE) -> painel do proprio time;
 *   Membro da equipe (EQUIPE)         -> "Minha mobilizacao", so com quem
 *                                        ele mesmo cadastrou.
 *
 * Quem decide o perfil e o servidor, pelo telefone encontrado dentro daquele
 * time: o navegador nao escolhe nada, e um EQUIPE jamais recebe o escopo de
 * Administrador do time.
 *
 * Este link NAO e o de recrutamento (`cmd_invites`): ele nao expira sozinho,
 * nao e reservado por navegador, nao e consumido no primeiro uso e vale para
 * todas as pessoas ativas daquele time. So o ADMIN geral consulta, copia e
 * renova.
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

/**
 * Revoga as sessoes de todo mundo que entra por aquele link: Administradores
 * do time e membros da equipe.
 *
 * Os aparelhos autorizados NAO sao tocados: quem ja estava vinculado
 * continua vinculado e apenas precisa entrar de novo, agora pelo endereco
 * novo.
 */
async function revokeTeamSessions(clientId: string): Promise<void> {
  const users = await selectRows<Pick<UserRow, 'id'>>(TABLES.users, {
    select: 'id',
    filters: { client_id: `eq.${clientId}`, role: 'in.(CANDIDATE,EQUIPE)' },
  });
  for (const user of users) await revokeUserSessions(user.id);
}

/**
 * Gera um endereco novo. O anterior para de funcionar na hora e todas as
 * sessoes abertas daquele time caem junto — administradores e membros da
 * equipe. Os aparelhos autorizados permanecem: e preciso apenas entrar de
 * novo, pelo link novo.
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

  await revokeTeamSessions(clientId);
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

/**
 * Resposta unica de recusa.
 *
 * Vale para telefone inexistente, duplicado, de outro time, acesso inativo e
 * aparelho diferente do autorizado. A tela nunca fica sabendo qual dos casos
 * aconteceu: dizer "aparelho nao autorizado" ja confirmaria que o telefone
 * existe.
 */
const GENERIC_ACCESS_ERROR = 'Não foi possível acessar com os dados informados.';

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
 * Entrada pelo link do time: link + telefone.
 *
 * O telefone e comparado somente na forma normalizada e apenas dentro do
 * time que o link identificou. Nenhum telefone, token ou URL vai para log, e
 * a resposta e sempre a mesma para qualquer telefone que nao sirva.
 */
export interface TeamLoginInput {
  token: string;
  phone: string;
  /** Credencial do aparelho, lida do cookie ou recem-sorteada no servidor. */
  deviceToken: string;
  request: NextRequest;
  signals?: DeviceSignalsInput;
}

export async function loginWithTeamPhone(input: TeamLoginInput): Promise<TeamLoginOutcome> {
  const { token, phone: rawPhone } = input;
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
    return { user: null, sessionToken: null, message: GENERIC_ACCESS_ERROR, throttled: false };
  }

  // Dentro daquele time, o telefone procura primeiro um Administrador do
  // time e depois um membro da equipe. A busca traz os dois perfis de uma
  // vez: se o numero levar a mais de uma pessoa ativa — dado antigo
  // duplicado — ninguem entra, porque escolher entre duas pessoas seria
  // decidir por conta propria quem e quem.
  const candidatos = await selectRows<UserRow>(TABLES.users, {
    select: '*',
    filters: {
      client_id: `eq.${link.client_id}`,
      role: 'in.(CANDIDATE,EQUIPE)',
      phone: `eq.${phone}`,
      is_active: 'is.true',
    },
  });

  const ativos = candidatos.filter(
    (row) => (row.role === 'CANDIDATE' && row.team_person_id) || (row.role === 'EQUIPE' && row.member_id),
  );
  const user = ativos.length === 1 ? ativos[0] : null;

  if (!user) {
    await registerAccessFailure(link);
    return { user: null, sessionToken: null, message: GENERIC_ACCESS_ERROR, throttled: false };
  }

  // Vinculo do aparelho, atomico no banco: sem aparelho ativo o navegador
  // atual vira o autorizado; com aparelho ativo so passa quem apresentar a
  // mesma credencial. Recusa devolve a MESMA mensagem do telefone errado.
  const deviceId = await bindAdminDevice({
    request: input.request,
    userId: user.id,
    token: input.deviceToken,
    signals: input.signals,
  });

  if (!deviceId) {
    await registerAccessFailure(link);
    return { user: null, sessionToken: null, message: GENERIC_ACCESS_ERROR, throttled: false };
  }

  const sessionToken = createToken();
  await insertOne<SessionRow>(
    TABLES.sessions,
    {
      user_id: user.id,
      token_hash: hashToken(sessionToken),
      expires_at: new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString(),
      // A sessao nasce presa ao aparelho: a conferencia continua valendo em
      // toda requisicao, nao so aqui no login.
      admin_device_id: deviceId,
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

  // O perfil da sessao vem da linha do banco, nunca do que foi digitado: um
  // membro da equipe jamais recebe o escopo de Administrador do time.
  const equipe = user.role === 'EQUIPE';
  const photo = equipe
    ? await memberPhoto(user.member_id)
    : await teamPersonPhoto(user.team_person_id);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      photo,
      role: equipe ? 'EQUIPE' : 'CANDIDATE',
      candidateId: user.client_id,
      memberId: equipe ? user.member_id : null,
      // Nenhum dos dois perfis tem senha: nao existe primeiro acesso a
      // cumprir nem troca a exigir.
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

/** Foto do integrante, ja assinada. */
async function memberPhoto(memberId: string | null): Promise<string | null> {
  if (!memberId) return null;
  const member = await selectOne<{ photo_path: string | null }>(TABLES.members, {
    select: 'photo_path',
    filters: { id: `eq.${memberId}` },
  });
  return signedUrl(member?.photo_path ?? null);
}
