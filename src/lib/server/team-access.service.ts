import 'server-only';
import type { NextRequest } from 'next/server';
import type {
  SessionUser,
  TeamAccessAudience,
  TeamAccessLink,
  TeamAccessLinks,
} from '@/lib/types';
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

/**
 * Acesso ao sistema pelo link do time: link proprio + telefone.
 *
 * Cada time tem DOIS enderecos, um por publico, e cada endereco aceita
 * somente os telefones do seu publico:
 *
 *   TEAM_ADMIN -> Administrador do time (CANDIDATE): painel do proprio time;
 *   EQUIPE     -> membro da equipe: "Minha mobilizacao", so com quem ele
 *                 mesmo cadastrou.
 *
 * A separacao e do servidor, nao da tela: o telefone de um membro
 * apresentado no link dos Administradores recebe a mesma recusa generica de
 * um telefone inexistente, e vice-versa. O perfil da sessao vem da linha do
 * banco, entao um EQUIPE jamais recebe o escopo de Administrador do time.
 *
 * Estes links NAO sao o de recrutamento (`cmd_invites`): eles nao expiram
 * sozinhos, nao sao reservados por navegador, nao sao consumidos no primeiro
 * uso e valem para todas as pessoas ativas daquele publico. So o ADMIN geral
 * consulta, copia e renova.
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
    audience: row.audience,
    token: row.token,
    active: row.active,
    createdAt: row.created_at,
    rotatedAt: row.rotated_at,
  };
}

export async function findAccessLinkRow(
  clientId: string,
  audience: TeamAccessAudience,
): Promise<TeamAccessLinkRow | null> {
  return selectOne<TeamAccessLinkRow>(TABLES.teamAccessLinks, {
    select: '*',
    filters: { client_id: `eq.${clientId}`, audience: `eq.${audience}` },
  });
}

/** Cria o endereco daquele publico quando ainda nao existe. Idempotente. */
export async function ensureTeamAccessLink(
  clientId: string,
  audience: TeamAccessAudience,
): Promise<TeamAccessLinkRow> {
  const current = await findAccessLinkRow(clientId, audience);
  if (current) return current;

  const token = createAccessToken();
  return insertOne<TeamAccessLinkRow>(
    TABLES.teamAccessLinks,
    { client_id: clientId, audience, token, token_hash: hashToken(token), active: true },
    '*',
  );
}

/**
 * Os dois enderecos do time, para o ADMIN geral copiar.
 *
 * Cria o que faltar: um time cadastrado antes da migration 019 pode ainda
 * nao ter o endereco da equipe.
 */
export async function getTeamAccessLinks(clientId: string): Promise<TeamAccessLinks> {
  const [admin, equipe] = await Promise.all([
    ensureTeamAccessLink(clientId, 'TEAM_ADMIN'),
    ensureTeamAccessLink(clientId, 'EQUIPE'),
  ]);

  return { TEAM_ADMIN: toAccessLink(admin), EQUIPE: toAccessLink(equipe) };
}

/** Perfil de usuario que cada endereco atende. */
const ROLE_OF_AUDIENCE: Record<TeamAccessAudience, 'CANDIDATE' | 'EQUIPE'> = {
  TEAM_ADMIN: 'CANDIDATE',
  EQUIPE: 'EQUIPE',
};

/* -------------------------------------------------------------------------
   Pagina publica de acesso
   ------------------------------------------------------------------------- */

export interface TeamAccessContext {
  clientId: string;
  /** Nome do time exibido na tela. Nenhum telefone ou nome de pessoa sai daqui. */
  clientName: string;
  /** Publico que aquele endereco atende. Nao aparece na tela. */
  audience: TeamAccessAudience;
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

  return { clientId: client.id, clientName: client.name, audience: link.audience };
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
 * Vale para telefone inexistente, duplicado, de outro time, de outro publico
 * (membro tentando o link dos Administradores, ou o contrario), acesso
 * inativo e aparelho diferente do autorizado. A tela nunca fica sabendo qual dos casos
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
 * O telefone e comparado somente na forma normalizada, apenas dentro do time
 * que o link identificou e apenas entre as pessoas do publico daquele
 * endereco. Nenhum telefone, token ou URL vai para log, e a resposta e
 * sempre a mesma para qualquer telefone que nao sirva.
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

  // O endereco usado decide QUEM pode entrar por ele: o link dos
  // Administradores so procura entre os Administradores daquele time, e o da
  // equipe so entre os membros. Telefone certo no endereco errado recebe a
  // mesma recusa generica de um telefone que nao existe.
  //
  // Se o numero levar a mais de uma pessoa ativa do mesmo publico — dado
  // antigo duplicado — ninguem entra: escolher entre duas pessoas seria
  // decidir por conta propria quem e quem.
  const papel = ROLE_OF_AUDIENCE[link.audience];

  const candidatos = await selectRows<UserRow>(TABLES.users, {
    select: '*',
    filters: {
      client_id: `eq.${link.client_id}`,
      role: `eq.${papel}`,
      phone: `eq.${phone}`,
      is_active: 'is.true',
    },
  });

  const ativos = candidatos.filter((row) =>
    row.role === 'CANDIDATE' ? Boolean(row.team_person_id) : Boolean(row.member_id),
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

  // O perfil da sessao vem da linha do banco, nunca do endereco nem do que
  // foi digitado: um membro da equipe jamais recebe o escopo de
  // Administrador do time.
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
