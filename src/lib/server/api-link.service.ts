import 'server-only';
import type { NextRequest } from 'next/server';
import type { ApiBindingInfo, ApiLink } from '@/lib/types';
import type { InviteState } from '@/lib/domain/invite-expiration';
import { TABLES, type ClientRow, type InviteRow } from '@/lib/supabase/tables';
import { callFunction, selectOne, selectRows } from '@/lib/supabase/rest';
import { invitePath } from '@/lib/utils/url';
import { publicLink } from './public-origin';
import { notFound } from './http';
import {
  ensurePersonalInvite,
  expireDueInvites,
  findInviteByUser,
  issuePersonalInvite,
} from './invite.service';
import type { ApiCaller } from './api-guard';

/**
 * Links de cadastro pela API.
 *
 * E a MESMA operacao do painel, com a mesma disciplina: um convite por
 * usuario (migration 012), prazo definido pelo ADMIN em Configuracoes (013),
 * token opaco de 160 bits gerado no servidor, geracao anterior derrubada na
 * hora e historico imutavel por geracao (013/020/021). Nao existe um segundo
 * sistema de links, nem um link "de API" com regras proprias.
 *
 * A API AGE COMO O DONO DA CHAVE. Gerar um link e exatamente o que
 * aconteceria se aquele Administrador do time entrasse no painel e clicasse
 * em "Gerar link": mesmo dono, MESMO GERADOR, mesmo prazo do perfil dele,
 * mesmos eventos, mesmo registro de geracao.
 *
 * E SO ELE. Todo acesso daqui e recortado pelo vinculo da chave
 * (`caller.owner`), que veio do banco e nao da requisicao: uma chave do Joao
 * nao gera, nao lista, nao consulta e nao revoga nada da Maria. Link de
 * outro administrador nao aparece como "sem permissao" — aparece como
 * inexistente, que e o que ele e, do ponto de vista daquela chave.
 *
 * Como o historico do link e, de proposito, indistinguivel de um clique
 * humano, o rastro da API fica do outro lado: em `cmd_api_key_events`, junto
 * da chave, com o ADMIN geral responsavel, o administrador em nome de quem
 * ela agiu, o time, a operacao e o resultado (migrations 030 e 031).
 */

const INVITE_COLUMNS =
  'id,client_id,user_id,token,active,issued_at,expires_at,status,claimed_at,consumed_at,' +
  'revoked_at,generation,owner_name,owner_role,generated_by_name,generated_by_role';

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

/** Time da chave. O identificador vem do vinculo, nunca da requisicao. */
async function loadTeam(caller: ApiCaller): Promise<TeamSlice> {
  const team = await selectOne<TeamSlice>(TABLES.clients, {
    select: 'id,name,recruiting_active',
    filters: { id: `eq.${caller.owner.clientId}` },
  });

  // O vinculo ja foi conferido na autenticacao; chegar aqui sem time seria
  // uma exclusao acontecendo no meio da requisicao.
  if (!team) throw notFound('Time não encontrado.');
  return team;
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

/* -------------------------------------------------------------------------
   Vinculo da chave
   ------------------------------------------------------------------------- */

/** A quem esta chave pertence: o time e o administrador, como estao agora. */
export async function getApiBinding(caller: ApiCaller): Promise<ApiBindingInfo> {
  const team = await loadTeam(caller);

  return {
    time: { id: team.id, nome: team.name, recrutamentoAtivo: team.recruiting_active },
    administrador: {
      id: caller.owner.userId,
      nome: caller.owner.userName,
      perfil: 'CANDIDATE',
    },
    chave: { nome: caller.keyName },
  };
}

/* -------------------------------------------------------------------------
   Links
   ------------------------------------------------------------------------- */

/**
 * Os links do administrador vinculado, do mais recente para o mais antigo.
 *
 * Na pratica e UM: cada usuario tem um unico convite, e gerar de novo renova
 * o mesmo registro. O recorte por dono e aplicado na consulta ao banco.
 *
 * O que passou do prazo e marcado como expirado NA CONSULTA, com o horario
 * do banco: o sistema nao tem cron, e a lista nunca mostra como ativo um
 * link vencido.
 */
export async function listApiLinks(
  request: NextRequest,
  caller: ApiCaller,
): Promise<ApiLink[]> {
  await expireDueInvites();
  const team = await loadTeam(caller);

  const invites = await selectRows<InviteSlice>(TABLES.invites, {
    select: INVITE_COLUMNS,
    filters: { user_id: `eq.${caller.owner.userId}` },
    order: 'issued_at.desc',
    limit: 50,
  });

  const links: ApiLink[] = [];
  for (const invite of invites) {
    links.push(await toApiLink(request, invite, team, caller.owner.userName));
  }
  return links;
}

/**
 * Um link do administrador vinculado.
 *
 * O filtro por dono entra NA CONSULTA, junto do identificador: link de outro
 * administrador responde 404, e nao 403 — a chave nao chega nem a saber que
 * ele existe.
 */
export async function getApiLink(
  request: NextRequest,
  caller: ApiCaller,
  id: string,
): Promise<ApiLink> {
  await expireDueInvites();

  const invite = await selectOne<InviteSlice>(TABLES.invites, {
    select: INVITE_COLUMNS,
    filters: { id: `eq.${id}`, user_id: `eq.${caller.owner.userId}` },
  });
  if (!invite) throw notFound('Link não encontrado.');

  const team = await loadTeam(caller);
  return toApiLink(request, invite, team, caller.owner.userName);
}

/**
 * Gera (ou renova) o link de cadastro do administrador vinculado a chave.
 *
 * Nao ha nada a escolher: dono, time e prazo saem do vinculo e do banco. A
 * geracao anterior daquele administrador deixa de funcionar no mesmo
 * instante, exatamente como quando ele clica no painel.
 */
export async function generateApiLink(
  request: NextRequest,
  caller: ApiCaller,
): Promise<ApiLink> {
  const team = await loadTeam(caller);
  const owner = caller.owner;

  // Sem link proprio ainda, o administrador adota o convite sem dono do time
  // — o mesmo caminho do painel, para nenhum endereco ja distribuido sumir.
  await ensurePersonalInvite(owner.userId, team.id, owner.userId);

  // Dono e gerador coincidem, exatamente como na rota do painel
  // (`/api/convite/renovar`, que chama `issuePersonalInvite(user.id, user.id)`).
  // E isto que faz o rastreamento sair identico ao de um clique do proprio
  // Administrador do time.
  await issuePersonalInvite(owner.userId, owner.userId);

  const invite = await findInviteByUser(owner.userId);
  if (!invite) throw notFound('Link não encontrado depois da geração.');

  return toApiLink(request, invite, team, owner.userName);
}

/**
 * Revoga um link do administrador vinculado.
 *
 * A conferencia de dono acontece ANTES de tocar no banco: `getApiLink` so
 * encontra o link se ele for daquele administrador, entao uma chave nunca
 * derruba o link de outra pessoa.
 *
 * O endereco para de funcionar na hora, e nenhum outro toma o lugar dele:
 * quem abrir ve a tela de link indisponivel. Repetir a chamada devolve o
 * mesmo resultado, sem duplicar nada no historico.
 */
export async function revokeApiLink(
  request: NextRequest,
  caller: ApiCaller,
  id: string,
): Promise<ApiLink> {
  await getApiLink(request, caller, id);

  // Aqui o ADMIN geral aparece no historico do link, e esta certo: revogar
  // nao imita clique nenhum — nao existe esse botao no painel. Todo evento
  // REVOKED avulso e, por definicao, uma acao da administracao.
  await callFunction<unknown>('cmd_invite_revoke', {
    p_invite_id: id,
    p_revoked_by: caller.adminUserId,
  });

  return getApiLink(request, caller, id);
}
