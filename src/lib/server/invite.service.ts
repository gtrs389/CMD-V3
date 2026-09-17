import 'server-only';
import type { Role } from '@/lib/types';
import type { InviteState } from '@/lib/domain/invite-expiration';
import { createInviteToken, hashToken } from '@/lib/auth/tokens';
import {
  TABLES,
  type ClientRow,
  type InviteRow,
  type UserRow,
} from '@/lib/supabase/tables';
import {
  callFunction,
  inFilter,
  insertOne,
  selectOne,
  selectRows,
  updateRows,
} from '@/lib/supabase/rest';

/**
 * Links pessoais de recrutamento.
 *
 * Cada usuario CANDIDATE e cada usuario EQUIPE tem um link proprio. O link
 * carrega apenas um identificador opaco e aleatorio; e o SERVIDOR que, a
 * partir dele, descobre a operacao e o responsavel pelo cadastro. Nenhum
 * `recruiterUserId` vindo do formulario publico e considerado em lugar
 * nenhum.
 *
 * O identificador e guardado tambem em claro (`token`), de proposito: o link
 * precisa continuar disponivel depois de sair, entrar de novo, trocar de
 * aparelho ou recarregar a pagina, sem depender de `sessionStorage`. Abrir a
 * pagina publica nunca gera, renova nem invalida token. Ele nao e credencial
 * de login, e revogavel (`active`) e nunca e registrado em log.
 */

const INVITE_COLUMNS =
  'id,client_id,user_id,token,token_hash,active,created_at,rotated_at,' +
  'issued_at,expires_at,status,claim_hash,claimed_at,consumed_at,revoked_at,generation,' +
  'owner_name,owner_role,generated_by_user_id,generated_by_name,generated_by_role,member_id';

/** Dono do link, ja resolvido no servidor. */
export interface InviteOwner {
  userId: string;
  name: string;
  role: Extract<Role, 'CANDIDATE' | 'EQUIPE'>;
  /** Integrante correspondente. Preenchido somente no perfil EQUIPE. */
  memberId: string | null;
}

export interface ResolvedInvite {
  clientId: string;
  /** Nulo somente em convite legado sem usuario vinculado. */
  owner: InviteOwner | null;
  /** Link individual ligado. */
  active: boolean;
  /** Recrutamento da operacao ligado pelo ADMIN. */
  operationActive: boolean;
  /** Ciclo de vida do link (migration 013). */
  state: InviteState;
  issuedAt: string;
  expiresAt: string;
  /** Prazo ainda valendo pelo horario do servidor. */
  withinDeadline: boolean;
}

/**
 * Traduz o token bruto do link para operacao e responsavel.
 *
 * A busca continua sendo pelo hash: assim os links gerados antes da
 * migration 012, quando so o hash era guardado, seguem valendo.
 */
export async function resolveInvite(token: string): Promise<ResolvedInvite | null> {
  if (!token) return null;

  const invite = await selectOne<InviteRow>(TABLES.invites, {
    select: INVITE_COLUMNS,
    filters: { token_hash: `eq.${hashToken(token)}` },
  });
  if (!invite) return null;

  const client = await selectOne<Pick<ClientRow, 'id' | 'recruiting_active'>>(TABLES.clients, {
    select: 'id,recruiting_active',
    filters: { id: `eq.${invite.client_id}` },
  });
  if (!client) return null;

  // O prazo e conferido com o horario do servidor, nunca com o do navegador.
  const state = invite.status as InviteState;
  const withinDeadline = new Date(invite.expires_at).getTime() > Date.now();

  let owner: InviteOwner | null = null;
  if (invite.user_id) {
    const user = await selectOne<
      Pick<UserRow, 'id' | 'name' | 'role' | 'client_id' | 'member_id' | 'is_active'>
    >(TABLES.users, {
      select: 'id,name,role,client_id,member_id,is_active',
      filters: { id: `eq.${invite.user_id}` },
    });

    // O dono precisa continuar ativo e pertencer a MESMA operacao do convite.
    // Vinculo entre times diferentes nao passa daqui, nem do banco.
    if (
      user &&
      user.is_active &&
      user.client_id === invite.client_id &&
      (user.role === 'CANDIDATE' || user.role === 'EQUIPE')
    ) {
      owner = {
        userId: user.id,
        name: user.name,
        role: user.role,
        memberId: user.member_id,
      };
    } else {
      // Dono inativo ou incoerente: o link para de aceitar cadastros.
      return {
        clientId: invite.client_id,
        owner: null,
        active: false,
        operationActive: false,
        state,
        issuedAt: invite.issued_at,
        expiresAt: invite.expires_at,
        withinDeadline: false,
      };
    }
  }

  return {
    clientId: invite.client_id,
    owner,
    active: invite.active,
    operationActive: client.recruiting_active,
    state,
    issuedAt: invite.issued_at,
    expiresAt: invite.expires_at,
    withinDeadline,
  };
}

/**
 * O link so aceita cadastro com a operacao ligada, o link individual ligado,
 * o prazo valendo e o estado ainda aberto.
 */
export function inviteAccepts(invite: ResolvedInvite | null): boolean {
  if (!invite || !invite.active || !invite.operationActive) return false;
  if (!invite.withinDeadline) return false;
  return invite.state === 'ACTIVE' || invite.state === 'CLAIMED' || invite.state === 'SUBMITTING';
}

/** Link que terminou: prazo vencido, cadastro concluido ou token substituido. */
export function inviteFinished(invite: ResolvedInvite | null): boolean {
  if (!invite) return false;
  if (!invite.withinDeadline) return true;
  return invite.state === 'CONSUMED' || invite.state === 'EXPIRED' || invite.state === 'REVOKED';
}

/**
 * O link ATUAL de um dono: o mais recente.
 *
 * Desde a migration 043 um dono pode ter varios links valendo ao mesmo tempo
 * (o lote). O "meu link" do painel e o ultimo gerado — que era exatamente o
 * que acontecia quando so existia um.
 */
export async function findInviteByUser(userId: string): Promise<InviteRow | null> {
  return selectOne<InviteRow>(TABLES.invites, {
    select: INVITE_COLUMNS,
    filters: { user_id: `eq.${userId}` },
    order: 'issued_at.desc,generation.desc',
  });
}

export interface IssuedBatchInvite {
  inviteId: string;
  token: string;
  issuedAt: string;
  expiresAt: string;
}

/**
 * Gera VARIOS links do mesmo dono de uma vez, sem revogar os que ja existem.
 *
 * Cada link continua de uso unico: um por pessoa. E isso que permite mandar
 * o cadastro para dez pessoas em uma tacada, em vez de gerar, enviar e
 * esperar cada uma se cadastrar para gerar o proximo.
 *
 * Os tokens nascem AQUI, no servidor, com a mesma entropia do link de
 * sempre; o banco confere a forma de cada um, decide o prazo pelo perfil do
 * dono e registra a geracao no historico, um evento por link.
 */
export async function issueInviteBatch(
  userId: string,
  quantidade: number,
  generatedByUserId?: string | null,
): Promise<IssuedBatchInvite[]> {
  const tokens = Array.from({ length: quantidade }, () => createInviteToken());

  const rows = await callFunction<
    { invite_id: string; token: string; issued_at: string; expires_at: string }[]
  >('cmd_invite_issue_lote', {
    p_user_id: userId,
    p_tokens: tokens,
    p_token_hashes: tokens.map((token) => hashToken(token)),
    p_generated_by: generatedByUserId ?? null,
  });

  return (Array.isArray(rows) ? rows : []).map((row) => ({
    inviteId: row.invite_id,
    token: row.token,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
  }));
}

/**
 * Geracao ou renovacao do link pessoal.
 *
 * Tudo acontece em uma transacao no banco: a geracao anterior e revogada na
 * hora (o token antigo deixa de valer imediatamente), o prazo sai da
 * configuracao do ADMIN conforme o PERFIL DO DONO — time usa o prazo de
 * time, integrante usa o de equipe — e `issued_at`/`expires_at` usam o
 * horario do banco. O navegador nao escolhe nada.
 */
export interface IssuedInvite {
  inviteId: string;
  token: string;
  issuedAt: string;
  expiresAt: string;
}

interface IssueRow {
  invite_id: string;
  issued_at: string;
  expires_at: string;
}

/**
 * Gera o link de `userId`, registrando QUEM executou.
 *
 * `userId` e o DONO do link: a hierarquia que recebe o cadastro e o nome que
 * permanece em "Cadastrado por". `generatedByUserId` e quem clicou — o
 * proprio dono, ou o ADMIN geral agindo em nome dele. Sem esse segundo
 * argumento o banco assume o proprio dono.
 *
 * O token nasce no servidor, com alta entropia e diferente a cada geracao. O
 * historico guarda apenas o hash e o identificador da geracao: token, URL e
 * segredo nunca entram no historico nem em log.
 */
export async function issuePersonalInvite(
  userId: string,
  generatedByUserId?: string | null,
): Promise<IssuedInvite> {
  const token = createInviteToken();

  const rows = await callFunction<IssueRow[]>('cmd_invite_issue', {
    p_user_id: userId,
    p_token: token,
    p_token_hash: hashToken(token),
    p_generated_by: generatedByUserId ?? null,
  });

  const row = Array.isArray(rows) ? rows[0] : (rows as unknown as IssueRow);
  return {
    inviteId: row.invite_id,
    token,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
  };
}

/* -------------------------------------------------------------------------
   Reserva do primeiro acesso e envio
   ------------------------------------------------------------------------- */

/** Resultado das transicoes atomicas feitas no banco. */
export type ClaimOutcome = 'OK' | 'TAKEN' | 'GONE' | 'BUSY';

/**
 * Reserva o link para o primeiro navegador que o abriu.
 *
 * Recebe apenas o SHA-256 do segredo do cookie: o segredo nunca chega ao
 * banco. Reabrir no mesmo navegador devolve `OK` sem criar novo evento;
 * qualquer outro navegador recebe `TAKEN`.
 */
export async function claimInvite(token: string, claimHash: string): Promise<ClaimOutcome> {
  return callFunction<ClaimOutcome>('cmd_invite_claim', {
    p_token_hash: hashToken(token),
    p_claim_hash: claimHash,
  });
}

/** CLAIMED -> SUBMITTING. Impede dois envios ao mesmo tempo. */
export async function beginInviteSubmit(
  token: string,
  claimHash: string,
): Promise<ClaimOutcome> {
  return callFunction<ClaimOutcome>('cmd_invite_begin_submit', {
    p_token_hash: hashToken(token),
    p_claim_hash: claimHash,
  });
}

/** Volta para CLAIMED quando o cadastro falha antes de ser salvo. */
export async function releaseInviteSubmit(token: string, claimHash: string): Promise<void> {
  await callFunction<boolean>('cmd_invite_release_submit', {
    p_token_hash: hashToken(token),
    p_claim_hash: claimHash,
  }).catch(() => undefined);
}

/**
 * Fecha o link em definitivo, depois que o integrante foi salvo.
 *
 * Vincula o convite ao integrante criado e registra o evento CONSUMED com o
 * instante do banco. O dono do link permanece o responsavel imutavel em
 * "Cadastrado por": nada aqui o altera. Repetir a chamada nao duplica nem o
 * registro nem o evento.
 */
export async function consumeInvite(token: string, memberId?: string | null): Promise<void> {
  await callFunction<boolean>('cmd_invite_consume', {
    p_token_hash: hashToken(token),
    p_member_id: memberId ?? null,
  });
}

/** Marca como expirado o que passou do prazo. Sem cron: acontece na leitura. */
export async function expireDueInvites(): Promise<void> {
  await callFunction<number>('cmd_invite_expire_due', {}).catch(() => undefined);
}

/**
 * Link pessoal do usuario, criado apenas se ainda nao existir.
 *
 * Chamar de novo nunca troca o token: abrir a pagina, entrar ou sair nao
 * pode invalidar um link ja compartilhado.
 */
export async function ensurePersonalInvite(
  userId: string,
  clientId: string,
  generatedByUserId?: string | null,
): Promise<InviteRow> {
  const current = await findInviteByUser(userId);
  if (current) return current;

  // Convite legado da operacao (sem dono): passa a ser o link do time,
  // preservando o token ja distribuido.
  const legacy = await selectOne<InviteRow>(TABLES.invites, {
    select: INVITE_COLUMNS,
    filters: { client_id: `eq.${clientId}`, user_id: 'is.null' },
  });

  if (legacy) {
    const [adopted] = await updateRows<InviteRow>(
      TABLES.invites,
      { id: `eq.${legacy.id}` },
      { user_id: userId },
      INVITE_COLUMNS,
    );
    if (adopted) return adopted;
  }

  // Primeiro link do usuario: nasce pela funcao SQL, ja com prazo e evento.
  await issuePersonalInvite(userId, generatedByUserId);
  const criado = await findInviteByUser(userId);
  if (criado) return criado;

  // Reserva teorica: se a leitura falhar, devolve o que foi possivel montar.
  const token = createInviteToken();
  return insertOne<InviteRow>(
    TABLES.invites,
    { client_id: clientId, user_id: userId, token, token_hash: hashToken(token), active: true },
    INVITE_COLUMNS,
  );
}

/**
 * Convite da operacao: o link do proprio time.
 *
 * Serve de referencia para a tela do time e para o ADMIN. Convite
 * legado, ainda sem dono, e aceito como o link da operacao.
 */
export async function loadOperationInvites(
  clientIds: string[],
): Promise<Map<string, InviteRow>> {
  const map = new Map<string, InviteRow>();
  if (clientIds.length === 0) return map;

  // Um time pode ter varios administradores, cada um com o proprio link.
  // O link exibido como "link do time" e sempre o do administrador ATIVO
  // mais antigo: a ordem fixa evita que a tela troque de endereco sozinha.
  //
  // O filtro por ativo e obrigatorio: o acesso antigo do time (e-mail e
  // senha) virou um usuario CANDIDATE desativado na migration 016, e ele
  // costuma ser o mais antigo da operacao. Sem o filtro, o link mostrado
  // seria o dele — muitas vezes um convite anterior a migration 012, sem
  // token legivel para copiar — e renova-lo falharia no banco, porque a
  // emissao recusa usuario inativo.
  const candidates = await selectRows<Pick<UserRow, 'id' | 'client_id'>>(TABLES.users, {
    select: 'id,client_id',
    filters: {
      client_id: inFilter(clientIds),
      role: 'eq.CANDIDATE',
      is_active: 'is.true',
    },
    order: 'created_at.asc',
  });

  const [legacy, owned] = await Promise.all([
    selectRows<InviteRow>(TABLES.invites, {
      select: INVITE_COLUMNS,
      filters: { client_id: inFilter(clientIds), user_id: 'is.null' },
    }),
    candidates.length
      ? selectRows<InviteRow>(TABLES.invites, {
          select: INVITE_COLUMNS,
          filters: { user_id: inFilter(candidates.map((row) => row.id)) },
        })
      : Promise.resolve([]),
  ]);

  for (const row of legacy) map.set(row.client_id, row);
  // O link do administrador tem precedencia sobre o convite legado; entre
  // administradores vale o primeiro da ordem de cadastro.
  // Ordem decrescente: quem grava por ultimo e o administrador mais antigo.
  const ordem = new Map(candidates.map((user, index) => [user.id, index]));
  for (const row of [...owned].sort(
    (a, b) => (ordem.get(b.user_id ?? '') ?? 0) - (ordem.get(a.user_id ?? '') ?? 0),
  )) {
    map.set(row.client_id, row);
  }
  return map;
}

/**
 * Gera um token novo para o link pessoal. O anterior deixa de valer na hora,
 * mesmo que ja estivesse reservado por alguem.
 */
export async function rotatePersonalInvite(
  userId: string,
  generatedByUserId?: string | null,
): Promise<InviteRow> {
  await issuePersonalInvite(userId, generatedByUserId);
  const row = await findInviteByUser(userId);
  if (!row) throw new Error('link nao encontrado depois da geracao');
  return row;
}
