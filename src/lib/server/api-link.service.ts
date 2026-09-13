import 'server-only';
import type { NextRequest } from 'next/server';
import type { ApiLink, ApiTeam } from '@/lib/types';
import type { InviteState } from '@/lib/domain/invite-expiration';
import { TABLES, type ClientRow, type InviteRow, type UserRow } from '@/lib/supabase/tables';
import { callFunction, inFilter, selectOne, selectRows } from '@/lib/supabase/rest';
import { invitePath } from '@/lib/utils/url';
import { publicLink } from './public-origin';
import { badRequest, notFound } from './http';
import {
  ensurePersonalInvite,
  expireDueInvites,
  findInviteByUser,
  issuePersonalInvite,
} from './invite.service';

/**
 * Links de cadastro pela API.
 *
 * E a MESMA operacao do painel, com a mesma disciplina: um convite por
 * usuario (migration 012), prazo definido pelo ADMIN em Configuracoes (013),
 * token opaco de 160 bits gerado no servidor, geracao anterior derrubada na
 * hora e historico imutavel por geracao (013/020/021). Nao existe um segundo
 * sistema de links, nem um link "de API" com regras proprias.
 *
 * O que a API acrescenta e apenas o pedido por programa — e a revogacao
 * avulsa, que o painel nao tinha: derrubar um link enviado por engano sem
 * precisar por outro no lugar.
 *
 * Quem chama e sempre o ADMIN geral (ver `api-guard.ts`), e e o nome dele que
 * fica no historico como quem gerou. O DONO do link — a hierarquia que
 * recebe o cadastro e o nome que permanece em "Cadastrado por" — continua
 * sendo o Administrador do time, nunca o ADMIN.
 */

const INVITE_COLUMNS =
  'id,client_id,user_id,token,active,issued_at,expires_at,status,claimed_at,consumed_at,' +
  'revoked_at,generation,owner_name,owner_role,generated_by_name,generated_by_role';

/** Teto de leitura por consulta, para um filtro amplo nao virar varredura. */
const LIMITE_PADRAO = 50;
const LIMITE_MAXIMO = 200;

type InviteSlice = Pick<
  InviteRow,
  | 'id'
  | 'client_id'
  | 'user_id'
  | 'token'
  | 'active'
  | 'issued_at'
  | 'expires_at'
  | 'status'
  | 'claimed_at'
  | 'consumed_at'
  | 'revoked_at'
  | 'generation'
  | 'owner_name'
  | 'owner_role'
  | 'generated_by_name'
  | 'generated_by_role'
>;

type TeamSlice = Pick<ClientRow, 'id' | 'name' | 'recruiting_active'>;

/** Perfis que tem link pessoal. Qualquer outro valor vira nulo na resposta. */
function ownerRole(value: string | null): 'CANDIDATE' | 'EQUIPE' | null {
  return value === 'CANDIDATE' || value === 'EQUIPE' ? value : null;
}

/**
 * Monta a resposta de um link.
 *
 * O endereco e montado no SERVIDOR, com o dominio publico configurado: quem
 * chama a API pode estar em qualquer lugar, e o link enviado as pessoas
 * nunca deve apontar para o painel.
 */
async function toApiLink(
  request: NextRequest,
  invite: InviteSlice,
  team: TeamSlice,
  ownerName: string,
): Promise<ApiLink> {
  return {
    id: invite.id,
    url: invite.token ? await publicLink(request, invitePath(invite.token)) : null,
    estado: invite.status as InviteState,
    // O link so recebe cadastro com as duas chaves ligadas: a do proprio
    // link e a do recrutamento do time.
    ativo: invite.active && team.recruiting_active,
    time: { id: team.id, nome: team.name },
    dono: {
      id: invite.user_id,
      nome: invite.owner_name ?? ownerName,
      perfil: ownerRole(invite.owner_role),
    },
    geradoPor: { nome: invite.generated_by_name, perfil: invite.generated_by_role },
    geradoEm: invite.issued_at,
    expiraEm: invite.expires_at,
    geracao: invite.generation,
    primeiroAcessoEm: invite.claimed_at,
    concluidoEm: invite.consumed_at,
    revogadoEm: invite.revoked_at,
  };
}

/** Times e clientes, em uma consulta so, para nao repetir busca por linha. */
async function loadTeams(ids: readonly string[]): Promise<Map<string, TeamSlice>> {
  if (ids.length === 0) return new Map();

  const rows = await selectRows<TeamSlice>(TABLES.clients, {
    select: 'id,name,recruiting_active',
    filters: { id: inFilter([...new Set(ids)]) },
  });
  return new Map(rows.map((row) => [row.id, row]));
}

/** Nome do dono quando o convite ainda nao tem o snapshot (links antigos). */
async function loadOwnerNames(ids: readonly string[]): Promise<Map<string, string>> {
  const alvos = [...new Set(ids)];
  if (alvos.length === 0) return new Map();

  const rows = await selectRows<Pick<UserRow, 'id' | 'name'>>(TABLES.users, {
    select: 'id,name',
    filters: { id: inFilter(alvos) },
  });
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function assemble(
  request: NextRequest,
  invites: InviteSlice[],
): Promise<ApiLink[]> {
  const teams = await loadTeams(invites.map((invite) => invite.client_id));
  const semSnapshot = invites
    .filter((invite) => !invite.owner_name && invite.user_id)
    .map((invite) => invite.user_id as string);
  const nomes = await loadOwnerNames(semSnapshot);

  const links: ApiLink[] = [];
  for (const invite of invites) {
    const team = teams.get(invite.client_id);
    // Time excluido no meio do caminho: o link nao tem mais a que pertencer.
    if (!team) continue;

    const nome = nomes.get(invite.user_id ?? '') ?? 'Não identificado';
    links.push(await toApiLink(request, invite, team, nome));
  }
  return links;
}

/* -------------------------------------------------------------------------
   Times
   ------------------------------------------------------------------------- */

/**
 * Times com os administradores que podem ser donos de um link.
 *
 * E a consulta que da ao programa os identificadores que ele precisa enviar
 * em `POST /api/v1/links`. So administradores ATIVOS entram: emitir link em
 * nome de um acesso desativado e recusado pelo banco.
 */
export async function listApiTeams(): Promise<ApiTeam[]> {
  const [teams, admins] = await Promise.all([
    selectRows<Pick<ClientRow, 'id' | 'name' | 'recruiting_active' | 'created_at'>>(
      TABLES.clients,
      { select: 'id,name,recruiting_active,created_at', order: 'name.asc', limit: 500 },
    ),
    selectRows<Pick<UserRow, 'id' | 'name' | 'client_id'>>(TABLES.users, {
      select: 'id,name,client_id',
      filters: { role: 'eq.CANDIDATE', is_active: 'is.true' },
      order: 'created_at.asc',
      limit: 2000,
    }),
  ]);

  return teams.map((team) => ({
    id: team.id,
    nome: team.name,
    recrutamentoAtivo: team.recruiting_active,
    criadoEm: team.created_at,
    administradores: admins
      .filter((admin) => admin.client_id === team.id)
      .map((admin) => ({ id: admin.id, nome: admin.name })),
  }));
}

/* -------------------------------------------------------------------------
   Links
   ------------------------------------------------------------------------- */

export interface ApiLinkFilter {
  clientId?: string;
  state?: InviteState;
  limit?: number;
}

/**
 * Links existentes, do mais recente para o mais antigo.
 *
 * O que vencer e marcado como expirado NA CONSULTA, com o horario do banco:
 * o sistema nao tem cron, e a lista nunca mostra como ativo um link que ja
 * passou do prazo.
 */
export async function listApiLinks(
  request: NextRequest,
  filter: ApiLinkFilter = {},
): Promise<ApiLink[]> {
  await expireDueInvites();

  const filters: Record<string, string> = {};
  if (filter.clientId) filters.client_id = `eq.${filter.clientId}`;
  if (filter.state) filters.status = `eq.${filter.state}`;

  const invites = await selectRows<InviteSlice>(TABLES.invites, {
    select: INVITE_COLUMNS,
    filters,
    order: 'issued_at.desc',
    limit: Math.min(Math.max(filter.limit ?? LIMITE_PADRAO, 1), LIMITE_MAXIMO),
  });

  return assemble(request, invites);
}

export async function getApiLink(request: NextRequest, id: string): Promise<ApiLink> {
  await expireDueInvites();

  const invite = await selectOne<InviteSlice>(TABLES.invites, {
    select: INVITE_COLUMNS,
    filters: { id: `eq.${id}` },
  });
  if (!invite) throw notFound('Link não encontrado.');

  const [link] = await assemble(request, [invite]);
  if (!link) throw notFound('Link não encontrado.');
  return link;
}

export interface GenerateApiLinkInput {
  clientId: string;
  /** Administrador do time dono do link. Ausente, vale o mais antigo ativo. */
  ownerId?: string;
}

/**
 * Gera (ou renova) o link de cadastro de um time.
 *
 * O dono do link e sempre um usuario do PROPRIO time: o `clientId` recebido
 * tem de bater com o vinculo do usuario no banco, e nao ha como emitir um
 * link cruzando times. Sem `ownerId`, vale a mesma regra do painel — o
 * administrador ATIVO mais antigo do time.
 *
 * A geracao anterior deixa de funcionar no mesmo instante.
 */
export async function generateApiLink(
  request: NextRequest,
  input: GenerateApiLinkInput,
  adminUserId: string,
): Promise<ApiLink> {
  const team = await selectOne<TeamSlice>(TABLES.clients, {
    select: 'id,name,recruiting_active',
    filters: { id: `eq.${input.clientId}` },
  });
  if (!team) throw notFound('Time não encontrado.');

  const owner = input.ownerId
    ? await selectOne<Pick<UserRow, 'id' | 'name' | 'role' | 'client_id' | 'is_active'>>(
        TABLES.users,
        {
          select: 'id,name,role,client_id,is_active',
          filters: { id: `eq.${input.ownerId}` },
        },
      )
    : await selectOne<Pick<UserRow, 'id' | 'name' | 'role' | 'client_id' | 'is_active'>>(
        TABLES.users,
        {
          select: 'id,name,role,client_id,is_active',
          filters: { client_id: `eq.${team.id}`, role: 'eq.CANDIDATE', is_active: 'is.true' },
          order: 'created_at.asc',
        },
      );

  if (!owner) {
    throw notFound(
      input.ownerId
        ? 'Dono do link não encontrado.'
        : 'Este time ainda não tem administrador. Cadastre um antes de gerar o link.',
    );
  }

  // O vinculo vem do BANCO, nunca do corpo da requisicao: mandar o `donoId`
  // de outro time nao gera link nenhum.
  if (owner.client_id !== team.id) throw badRequest('Este dono não pertence ao time informado.');
  if (!owner.is_active) throw badRequest('O acesso deste dono está desativado.');
  if (owner.role !== 'CANDIDATE' && owner.role !== 'EQUIPE') {
    throw badRequest('Este perfil não tem link de cadastro.');
  }

  // Sem link proprio ainda, o administrador adota o convite sem dono do time
  // — o mesmo caminho do painel, para nenhum endereco ja distribuido sumir.
  await ensurePersonalInvite(owner.id, team.id, adminUserId);
  await issuePersonalInvite(owner.id, adminUserId);

  const invite = await findInviteByUser(owner.id);
  if (!invite) throw notFound('Link não encontrado depois da geração.');

  return toApiLink(request, invite, team, owner.name);
}

/**
 * Revoga um link ja enviado.
 *
 * O endereco para de funcionar na hora, e nenhum outro toma o lugar dele:
 * quem abrir ve a tela de link indisponivel. Repetir a chamada devolve o
 * mesmo resultado, sem duplicar nada no historico.
 */
export async function revokeApiLink(
  request: NextRequest,
  id: string,
  adminUserId: string,
): Promise<ApiLink> {
  await callFunction<unknown>('cmd_invite_revoke', {
    p_invite_id: id,
    p_revoked_by: adminUserId,
  });

  return getApiLink(request, id);
}
