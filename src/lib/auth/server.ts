import 'server-only';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/lib/types';
import { can } from '@/lib/permissions';
import { SupabaseConfigError } from '@/lib/supabase/env';
import {
  currentSessionState,
  SESSION_BLOCK_MESSAGES,
  type SessionState,
} from '@/lib/server/auth.service';
import { FIRST_ACCESS_PATH, homePathFor, LOGIN_PATH } from './constants';

/**
 * Sessao atual em Server Components e layouts.
 *
 * Sem configuracao do Supabase o sistema falha fechado: devolve `null`, o que
 * leva ao login. Em nenhum caso existe acesso liberado sem banco.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  return (await getSessionState()).user;
}

/**
 * A sessao atual e, quando ela deixou de valer, o motivo.
 *
 * O motivo existe para uma tela so: quem esta dentro do painel quando o
 * ADMIN geral desliga o acesso do Time DEMO precisa ver que foi
 * desconectado, em vez de simplesmente se encontrar no login.
 *
 * Falha fechado, como sempre: sem banco nao ha sessao, e nao ha motivo
 * nenhum a apresentar — a pessoa vai para o login.
 */
export async function getSessionState(): Promise<SessionState & { message: string | null }> {
  try {
    const state = await currentSessionState();
    return {
      ...state,
      message: state.blocked ? SESSION_BLOCK_MESSAGES[state.blocked] : null,
    };
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      console.error('[auth] Supabase não configurado:', error.message);
      return { user: null, blocked: null, message: null };
    }
    console.error('[auth] Não foi possível validar a sessão:', error);
    return { user: null, blocked: null, message: null };
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
 * O time que tentar abrir pela URL volta para a propria pagina: a
 * decisao de acesso dos dados continua acontecendo em cada rota de API.
 */
export async function requireAdminPage(): Promise<SessionUser> {
  const user = await requirePageUser();
  if (!can(user, 'admin.access')) redirect(homePathFor(user));
  return user;
}
