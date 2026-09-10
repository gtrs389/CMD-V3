import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { LOGIN_PATH } from '@/lib/auth/constants';
import { hasPanelAccess } from '@/lib/permissions';
import { AppShell } from '@/components/layout/AppShell';
import { SessionProvider } from '@/components/layout/SessionProvider';

/**
 * Camada administrativa.
 *
 * Alem do proxy, a sessao e conferida aqui: acesso direto a qualquer rota
 * do painel sem permissao volta para o login.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user || !hasPanelAccess(user)) {
    redirect(LOGIN_PATH);
  }

  return (
    <SessionProvider initialUser={user}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
