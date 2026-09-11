import 'server-only';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/lib/types';
import { can } from '@/lib/permissions';
import { SupabaseConfigError } from '@/lib/supabase/env';
import { currentUser } from '@/lib/server/auth.service';
import { FIRST_ACCESS_PATH, homePathFor, LOGIN_PATH } from './constants';

/**
 * Sessao atual em Server Components e layouts.
 *
 * Sem configuracao do Supabase o sistema falha fechado: devolve `null`, o que
 * leva ao login. Em nenhum caso existe acesso liberado sem banco.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    return await currentUser();
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      console.error('[auth] Supabase não configurado:', error.message);
      return null;
    }
    console.error('[auth] Não foi possível validar a sessão:', error);
    return null;
  }
}

/**
 * Sessao obrigatoria em uma pagina do painel.
 * Sem sessao valida a navegacao volta para o login.
 */
export async function requirePageUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(LOGIN_PATH);
  if (user.mustChangePassword) redirect(FIRST_ACCESS_PATH);
  return user;
}

/**
 * Pagina exclusiva do ADMIN.
 *
 * O candidato que tentar abrir pela URL volta para a propria pagina: a
 * decisao de acesso dos dados continua acontecendo em cada rota de API.
 */
export async function requireAdminPage(): Promise<SessionUser> {
  const user = await requirePageUser();
  if (!can(user, 'admin.access')) redirect(homePathFor(user));
  return user;
}
