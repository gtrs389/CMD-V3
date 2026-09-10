import 'server-only';
import type { SessionUser } from '@/lib/types';
import { SupabaseConfigError } from '@/lib/supabase/env';
import { currentUser } from '@/lib/server/auth.service';

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
