import 'server-only';
import type { Role } from '@/lib/types';
import { createInviteToken, hashToken } from '@/lib/auth/tokens';
import { TABLES, type ClientRow, type InviteRow, type UserRow } from '@/lib/supabase/tables';
import { inFilter, insertOne, selectOne, selectRows, updateRows } from '@/lib/supabase/rest';

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

const INVITE_COLUMNS = 'id,client_id,user_id,token,token_hash,active,created_at,rotated_at';

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

  let owner: InviteOwner | null = null;
  if (invite.user_id) {
    const user = await selectOne<
      Pick<UserRow, 'id' | 'name' | 'role' | 'client_id' | 'member_id' | 'is_active'>
    >(TABLES.users, {
      select: 'id,name,role,client_id,member_id,is_active',
      filters: { id: `eq.${invite.user_id}` },
    });

    // O dono precisa continuar ativo e pertencer a MESMA operacao do convite.
    // Vinculo entre candidatos diferentes nao passa daqui, nem do banco.
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
      return { clientId: invite.client_id, owner: null, active: false, operationActive: false };
    }
  }

  return {
    clientId: invite.client_id,
    owner,
    active: invite.active,
    operationActive: client.recruiting_active,
  };
}

/** O link so aceita cadastro com a operacao ligada e o link individual ligado. */
export function inviteAccepts(invite: ResolvedInvite | null): boolean {
  return Boolean(invite && invite.active && invite.operationActive);
}

export async function findInviteByUser(userId: string): Promise<InviteRow | null> {
  return selectOne<InviteRow>(TABLES.invites, {
    select: INVITE_COLUMNS,
    filters: { user_id: `eq.${userId}` },
  });
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
): Promise<InviteRow> {
  const current = await findInviteByUser(userId);
  if (current) return current;

  // Convite legado da operacao (sem dono): passa a ser o link do candidato,
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

  const token = createInviteToken();
  return insertOne<InviteRow>(
    TABLES.invites,
    { client_id: clientId, user_id: userId, token, token_hash: hashToken(token), active: true },
    INVITE_COLUMNS,
  );
}

/**
 * Convite da operacao: o link do proprio candidato.
 *
 * Serve de referencia para a tela do candidato e para o ADMIN. Convite
 * legado, ainda sem dono, e aceito como o link da operacao.
 */
export async function loadOperationInvites(
  clientIds: string[],
): Promise<Map<string, InviteRow>> {
  const map = new Map<string, InviteRow>();
  if (clientIds.length === 0) return map;

  const candidates = await selectRows<Pick<UserRow, 'id' | 'client_id'>>(TABLES.users, {
    select: 'id,client_id',
    filters: { client_id: inFilter(clientIds), role: 'eq.CANDIDATE' },
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
  // O link do candidato tem precedencia sobre o convite legado.
  for (const row of owned) map.set(row.client_id, row);
  return map;
}

/** Gera um token novo para o link pessoal. O anterior deixa de valer. */
export async function rotatePersonalInvite(
  userId: string,
  clientId: string,
): Promise<InviteRow> {
  await ensurePersonalInvite(userId, clientId);
  const token = createInviteToken();

  const [row] = await updateRows<InviteRow>(
    TABLES.invites,
    { user_id: `eq.${userId}` },
    { token, token_hash: hashToken(token), rotated_at: new Date().toISOString(), active: true },
    INVITE_COLUMNS,
  );
  return row;
}
