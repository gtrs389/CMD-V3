import 'server-only';
import type { SessionUser } from '@/lib/types';
import { can, canReachClient, canReachMember, type Permission } from '@/lib/permissions';
import { TABLES, type MemberRow } from '@/lib/supabase/tables';
import { selectOne } from '@/lib/supabase/rest';
import { currentUser } from './auth.service';
import { forbidden, notFound, unauthorized } from './http';

/**
 * Protecao das operacoes do painel.
 *
 * Cada rota chama uma destas funcoes antes de tocar no banco. O `proxy.ts`
 * apenas melhora a navegacao: a decisao de acesso acontece sempre aqui.
 *
 * Esconder botao nao protege nada. Trocar URL, `memberId`, `clientId`,
 * filtro ou corpo da requisicao nunca amplia o acesso, porque o vinculo da
 * sessao e comparado com a linha do banco a cada requisicao.
 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw unauthorized();

  // Senha temporaria em uso: nada alem do primeiro acesso e liberado.
  if (user.mustChangePassword) {
    throw forbidden('Defina a nova senha para continuar.');
  }

  if (!can(user, permission)) throw forbidden();
  return user;
}

/** Sessao com senha temporaria, usada apenas pela rota do primeiro acesso. */
export async function requireSession(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw unauthorized();
  return user;
}

/**
 * Permissao e escopo por operacao na mesma conferencia.
 *
 * ADMIN alcanca qualquer time; CANDIDATE, somente o proprio. EQUIPE
 * nunca alcanca o registro do time: a area dela e "Minha mobilizacao".
 */
export async function requireClientAccess(
  permission: Permission,
  clientId: string,
): Promise<SessionUser> {
  const user = await requirePermission(permission);
  if (!canReachClient(user, clientId)) throw forbidden();
  return user;
}

/**
 * Sessao do perfil EQUIPE, com a operacao ja resolvida pelo banco.
 *
 * O identificador da operacao e do integrante vem sempre da sessao, nunca
 * da URL ou do corpo da requisicao.
 */
export interface TeamSession extends SessionUser {
  candidateId: string;
  memberId: string;
}

export async function requireTeamSession(): Promise<TeamSession> {
  const user = await requirePermission('team.access');
  if (user.role !== 'EQUIPE' || !user.candidateId || !user.memberId) throw forbidden();
  return { ...user, candidateId: user.candidateId, memberId: user.memberId };
}

/**
 * Mesma regra, a partir do integrante: a hierarquia e aplicada sobre a
 * linha do banco.
 *
 * ADMIN alcanca qualquer integrante. CANDIDATE alcanca toda a propria
 * operacao, em qualquer nivel. EQUIPE alcanca somente quem se cadastrou
 * pelo proprio link: irmaos, pessoas de outro recrutador e descendentes dos
 * proprios recrutados ficam de fora.
 */
export async function requireMemberAccess(
  permission: Permission,
  memberId: string,
): Promise<SessionUser> {
  const user = await requirePermission(permission);

  const row = await selectOne<Pick<MemberRow, 'id' | 'client_id' | 'recruited_by_user_id'>>(
    TABLES.members,
    { select: 'id,client_id,recruited_by_user_id', filters: { id: `eq.${memberId}` } },
  );
  if (!row) throw notFound('Integrante não encontrado.');

  const allowed = canReachMember(user, {
    clientId: row.client_id,
    recruitedByUserId: row.recruited_by_user_id,
  });
  if (!allowed) throw forbidden();

  return user;
}
