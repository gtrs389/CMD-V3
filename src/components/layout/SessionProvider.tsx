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
import { fetchSessionState, logout as requestLogout } from '@/lib/auth/client';
import { LOGIN_PATH } from '@/lib/auth/constants';
import { AccessBlockedDialog } from './AccessBlockedDialog';

/**
 * Intervalo do batimento que confere a sessao com o servidor.
 *
 * Cinco segundos para quem PODE ser desligado — os administradores de um
 * time: o ADMIN geral desliga o acesso do Time DEMO e quem esta dentro e
 * avisado praticamente na hora, sem abrir conexao permanente nenhuma. O
 * sistema roda em funcoes que nascem e morrem a cada requisicao, onde uma
 * conexao aberta por aba custaria uma funcao viva o tempo todo; a consulta
 * daqui e uma linha de sessao, e so acontece com a aba a vista.
 *
 * Meio minuto para o ADMIN geral, que nao pertence a time nenhum e nao tem
 * como ser desligado. Para ele o batimento serve apenas para perceber uma
 * sessao vencida — e nao ha por que pagar doze consultas por minuto por
 * isso.
 */
const HEARTBEAT_MS = 5000;
const HEARTBEAT_ADMIN_MS = 30_000;

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

  /**
   * Aviso de acesso desligado.
   *
   * Guarda a mensagem que o servidor mandou, e nao um booleano: quem escreve
   * o texto e quem sabe o motivo.
   */
  const [blocked, setBlocked] = useState<string | null>(null);

  /**
   * Confere a sessao com o servidor.
   *
   * Tres desfechos, e cada um tem o seu:
   *
   *   - sessao valida: segue a vida (e, se havia aviso na tela, ele sai — o
   *     ADMIN geral religou o acesso, e a pessoa volta de onde parou);
   *   - acesso desligado: o aviso aparece por cima de tudo. NAO leva para o
   *     login: quem some sem explicacao deixa a pessoa achando que o sistema
   *     quebrou;
   *   - sem sessao: e o caminho de sempre, de volta para o login.
   *
   * Falha de rede nao decide nada. Derrubar alguem porque a conexao piscou
   * por dois segundos seria pior do que o problema que isto resolve.
   */
  const revalidate = useCallback(
    async ({ silent }: { silent?: boolean } = {}) => {
      if (!silent) setRestoring(true);
      const state = await fetchSessionState();
      if (!silent) setRestoring(false);

      if (!state.reached) return;

      if (state.blocked) {
        setBlocked(state.message ?? 'Sua conta foi desconectada.');
        setUser(null);
        return;
      }

      setBlocked(null);
      setUser(state.user);
      if (!state.user) router.replace(LOGIN_PATH);
      // Religou: a tela precisa buscar de novo o que ficou para tras.
      else if (blocked) router.refresh();
    },
    [blocked, router],
  );

  // Batimento: e ele que faz o desligamento aparecer sem ninguem recarregar
  // a pagina. Para com a aba escondida — aba em segundo plano nao tem quem
  // ver o aviso, e o intervalo do navegador seria estrangulado de qualquer
  // forma — e volta assim que ela reaparece.
  useEffect(() => {
    if (!initialUser && !user) return;

    let timer: number | undefined;

    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void revalidate({ silent: true });
    };

    const intervalo =
      (initialUser ?? user)?.role === 'ADMIN' ? HEARTBEAT_ADMIN_MS : HEARTBEAT_MS;

    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(tick, intervalo);
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      // Ao voltar para a aba a conferencia e IMEDIATA: o desligamento pode
      // ter acontecido enquanto ela estava escondida.
      void revalidate();
      start();
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [initialUser, user, revalidate]);

  const signOut = useCallback(async () => {
    await requestLogout();
    setUser(null);
    setBlocked(null);
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

  return (
    <SessionContext.Provider value={value}>
      {children}
      {/* Por cima de tudo, e sem saida pelos cantos: o acesso acabou, e a
          unica acao possivel e sair. */}
      {blocked ? <AccessBlockedDialog message={blocked} onLeave={signOut} /> : null}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession precisa estar dentro de <SessionProvider>.');
  return context;
}
