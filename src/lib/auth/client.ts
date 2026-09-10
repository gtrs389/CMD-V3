import type { SessionUser } from '@/lib/types';

/**
 * Cliente HTTP da autenticacao.
 *
 * As telas conversam apenas com estas funcoes. Trocar o backend de
 * autenticacao no futuro nao exige alterar a tela de login.
 */

export interface LoginResult {
  ok: boolean;
  user?: SessionUser;
  message?: string;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      user?: SessionUser;
      message?: string;
    };

    if (!response.ok) {
      return { ok: false, message: data.message ?? 'Não foi possível entrar. Tente novamente.' };
    }
    return { ok: true, user: data.user };
  } catch {
    return { ok: false, message: 'Falha de conexão. Verifique sua rede e tente novamente.' };
  }
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
}

export async function fetchSession(): Promise<SessionUser | null> {
  try {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as { user: SessionUser | null };
    return data.user ?? null;
  } catch {
    return null;
  }
}
