'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Permission } from '@/lib/permissions';
import { can as canPermission } from '@/lib/permissions';
import type { SessionUser } from '@/lib/types';
import { fetchSession, logout as requestLogout } from '@/lib/auth/client';
import { LOGIN_PATH } from '@/lib/auth/constants';

interface SessionContextValue {
  user: SessionUser | null;
  /** Verdadeiro enquanto a sessao esta sendo reconferida no navegador. */
  restoring: boolean;
  can: (permission: Permission) => boolean;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

interface SessionProviderProps {
  /** Sessao lida no servidor: evita piscar a interface ao abrir o painel. */
  initialUser: SessionUser | null;
  children: ReactNode;
}

export function SessionProvider({ initialUser, children }: SessionProviderProps) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(initialUser);
  const [restoring, setRestoring] = useState(false);

  // Reconfere a sessao ao voltar para a aba: o cookie pode ter expirado.
  useEffect(() => {
    const revalidate = async () => {
      if (document.visibilityState !== 'visible') return;
      setRestoring(true);
      const current = await fetchSession();
      setUser(current);
      setRestoring(false);
      if (!current) router.replace(LOGIN_PATH);
    };

    document.addEventListener('visibilitychange', revalidate);
    return () => document.removeEventListener('visibilitychange', revalidate);
  }, [router]);

  const signOut = useCallback(async () => {
    await requestLogout();
    setUser(null);
    router.replace(LOGIN_PATH);
    router.refresh();
  }, [router]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      restoring,
      can: (permission: Permission) => canPermission(user, permission),
      signOut,
    }),
    [user, restoring, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession precisa estar dentro de <SessionProvider>.');
  return context;
}
