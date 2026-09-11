import 'server-only';
import type { SessionUser } from '@/lib/types';
import { can, canReachClient, type Permission } from '@/lib/permissions';
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
 * Esconder botao nao protege nada. O candidato so alcanca o proprio registro
 * porque o vinculo da sessao e comparado com o identificador pedido, a cada
 * requisicao.
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
 * Permissao e escopo do candidato na mesma conferencia.
 * ADMIN alcanca qualquer registro; CANDIDATE, somente o proprio.
 */
export async function requireClientAccess(
  permission: Permission,
  clientId: string,
): Promise<SessionUser> {
  const user = await requirePermission(permission);
  if (!canReachClient(user, clientId)) throw forbidden();
  return user;
}

/** Mesma regra, a partir do integrante: o vinculo vem do banco. */
export async function requireMemberAccess(
  permission: Permission,
  memberId: string,
): Promise<SessionUser> {
  const user = await requirePermission(permission);

  const row = await selectOne<Pick<MemberRow, 'id' | 'client_id'>>(TABLES.members, {
    select: 'id,client_id',
    filters: { id: `eq.${memberId}` },
  });
  if (!row) throw notFound('Integrante não encontrado.');
  if (!canReachClient(user, row.client_id)) throw forbidden();

  return user;
}
