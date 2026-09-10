import 'server-only';
import type { SessionUser } from '@/lib/types';
import { can, type Permission } from '@/lib/permissions';
import { currentUser } from './auth.service';
import { forbidden, unauthorized } from './http';

/**
 * Protecao das operacoes administrativas.
 *
 * Cada rota chama `requirePermission` antes de tocar no banco. O `proxy.ts`
 * apenas melhora a navegacao: a decisao de acesso acontece sempre aqui.
 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw unauthorized();
  if (!can(user, permission)) throw forbidden();
  return user;
}
