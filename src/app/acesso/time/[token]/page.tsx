import type { Metadata } from 'next';
import { appConfig } from '@/config/app.config';
import { Logo } from '@/components/layout/Logo';
import { TeamAccessForm } from '@/components/public/TeamAccessForm';
import { GENERIC_LINK_ERROR, resolveTeamAccess } from '@/lib/server/team-access.service';

export const metadata: Metadata = {
  title: 'Acesso do time',
  robots: { index: false, follow: false },
};

/**
 * Entrada dos Administradores do time.
 *
 * O token e opaco e nao carrega nenhum dado pessoal: quem o traduz para um
 * time e o servidor. A tela mostra apenas a identidade do sistema e o nome do
 * time — nenhum nome de pessoa, nenhum telefone e nenhuma lista de quem tem
 * acesso. Link inexistente, revogado ou substituido recebe sempre a mesma
 * mensagem neutra.
 */
export default async function TeamAccessPage({ params }: PageProps<'/acesso/time/[token]'>) {
  const { token } = await params;
  const context = await resolveTeamAccess(token).catch(() => null);

  return (
    <main className="safe-x safe-top flex min-h-dvh flex-col bg-surface-muted">
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md animate-rise rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
          <Logo className="justify-center" />

          {context ? (
            <>
              <p className="mt-6 text-center text-[0.6875rem] font-semibold tracking-[0.14em] text-ink-500 uppercase">
                {context.clientName}
              </p>
              <h1 className="mt-1.5 text-center text-xl leading-tight font-bold tracking-tight text-ink-900">
                Acesse o seu time
              </h1>

              <TeamAccessForm token={token} />
            </>
          ) : (
            <p role="alert" className="mt-6 text-center text-sm text-ink-700">
              {GENERIC_LINK_ERROR}
            </p>
          )}
        </div>
      </div>

      <p className="pb-6 text-center text-xs text-ink-400">{appConfig.shortName}</p>
    </main>
  );
}
