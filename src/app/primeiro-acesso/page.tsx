import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { appConfig } from '@/config/app.config';
import { getCurrentUser } from '@/lib/auth/server';
import { homePathFor, LOGIN_PATH } from '@/lib/auth/constants';
import { Logo } from '@/components/layout/Logo';
import { FirstAccessForm } from '@/components/auth/FirstAccessForm';

export const metadata: Metadata = {
  title: 'Primeiro acesso',
};

/** Depende do cookie de sessao: nunca e pre-renderizada. */
export const dynamic = 'force-dynamic';

/**
 * Troca obrigatoria da senha temporaria.
 *
 * Quem chega aqui ja entrou com a senha recebida do administrador. Enquanto
 * a troca nao acontecer, nenhuma outra rota do painel abre.
 */
export default async function FirstAccessPage() {
  const user = await getCurrentUser();
  if (!user) redirect(LOGIN_PATH);
  if (!user.mustChangePassword) redirect(homePathFor(user));

  return (
    <main className="safe-x flex min-h-dvh flex-col justify-center bg-surface-muted px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>

        <div className="animate-rise rounded-card border border-line bg-surface p-5 shadow-card sm:p-7">
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">Primeiro acesso</h1>
          <p className="mt-1 text-sm text-ink-500">
            Olá, {user.name.split(' ')[0]}. Defina uma senha sua para continuar. A senha temporária
            deixa de funcionar agora.
          </p>

          <FirstAccessForm />
        </div>

        <p className="mt-6 text-center text-xs text-balance text-ink-500">
          {appConfig.name} ({appConfig.shortName}) — acesso restrito.
        </p>
      </div>
    </main>
  );
}
