import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { FIRST_ACCESS_PATH, LOGIN_PATH } from '@/lib/auth/constants';
import { hasPanelAccess } from '@/lib/permissions';
import { AppShell } from '@/components/layout/AppShell';
import { SessionProvider } from '@/components/layout/SessionProvider';

/**
 * Camada administrativa.
 *
 * A autorizacao acontece aqui, contra `cmd_sessions` no banco. O `proxy.ts`
 * apenas melhora a navegacao olhando a presenca do cookie; cada rota de API
 * confere a sessao por conta propria antes de qualquer operacao.
 */
/** Depende do cookie de sessao: nunca e pre-renderizada. */
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user || !hasPanelAccess(user)) {
    redirect(LOGIN_PATH);
  }

  // Senha temporaria em uso: nenhuma outra rota do painel abre antes da troca.
  if (user.mustChangePassword) {
    redirect(FIRST_ACCESS_PATH);
  }

  return (
    <SessionProvider initialUser={user}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
