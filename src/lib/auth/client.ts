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

export interface SessionState {
  user: SessionUser | null;
  /**
   * Motivo de a sessao ter deixado de valer, quando ha um.
   *
   * Hoje so existe `DEMO_DESLIGADO`: o ADMIN geral desligou o acesso daquele
   * Time DEMO. Sem motivo, uma sessao ausente e apenas uma sessao ausente.
   */
  blocked: string | null;
  message: string | null;
  /**
   * A resposta chegou? Falha de rede nao e sessao encerrada — derrubar
   * alguem do painel porque o Wi-Fi caiu por dois segundos seria pior do que
   * o problema que o batimento resolve.
   */
  reached: boolean;
}

const SEM_RESPOSTA: SessionState = {
  user: null,
  blocked: null,
  message: null,
  reached: false,
};

export async function fetchSessionState(): Promise<SessionState> {
  try {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    if (!response.ok) return SEM_RESPOSTA;

    const data = (await response.json()) as {
      user?: SessionUser | null;
      blocked?: string | null;
      message?: string | null;
    };

    return {
      user: data.user ?? null,
      blocked: data.blocked ?? null,
      message: data.message ?? null,
      reached: true,
    };
  } catch {
    return SEM_RESPOSTA;
  }
}

export async function fetchSession(): Promise<SessionUser | null> {
  return (await fetchSessionState()).user;
}
