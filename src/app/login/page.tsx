import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { appConfig } from '@/config/app.config';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { getCurrentUser } from '@/lib/auth/server';
import { DEFAULT_AUTHENTICATED_PATH } from '@/lib/auth/constants';
import { LoginForm } from '@/components/auth/LoginForm';
import { Logo } from '@/components/layout/Logo';

export const metadata: Metadata = {
  title: 'Entrar',
};

/** Depende do cookie de sessao: nunca e pre-renderizada. */
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: PageProps<'/login'>) {
  // Sessao valida nao precisa ver o login. A conferencia e feita no banco,
  // nunca apenas pela presenca do cookie.
  if (await getCurrentUser()) redirect(DEFAULT_AUTHENTICATED_PATH);

  const params = await searchParams;
  const raw = params?.proximo;
  const candidate = Array.isArray(raw) ? raw[0] : raw;

  // Aceita apenas caminhos internos: evita redirecionamento para outro site.
  const next = candidate && /^\/(?!\/)/.test(candidate) ? candidate : undefined;

  const senha = Array.isArray(params?.senha) ? params.senha[0] : params?.senha;
  const senhaAlterada = senha === 'alterada';

  return (
    <main className="safe-x flex min-h-dvh flex-col justify-center bg-surface-muted px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>

        <div className="animate-rise rounded-card border border-line bg-surface p-5 shadow-card sm:p-7">
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">
            Acesso administrativo
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Entre com as credenciais de administrador para gerenciar candidatos e equipes.
          </p>

          {senhaAlterada ? (
            <p
              role="status"
              className="mt-4 rounded-control border border-success-50 bg-success-50 px-3 py-2.5 text-sm font-medium text-success-700"
            >
              Senha alterada com sucesso. Entre novamente.
            </p>
          ) : null}

          <LoginForm next={next} configured={isSupabaseConfigured()} />
        </div>

        <p className="mt-6 text-center text-xs text-balance text-ink-500">
          {appConfig.name} ({appConfig.shortName}) — acesso restrito a administradores.
        </p>
      </div>
    </main>
  );
}
