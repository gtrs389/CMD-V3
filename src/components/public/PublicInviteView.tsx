'use client';

import { Link2Off, WifiOff } from 'lucide-react';
import { appConfig } from '@/config/app.config';
import { useClientByToken } from '@/hooks/use-clients';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { PublicFormView } from './PublicFormView';

interface PublicInviteViewProps {
  token: string;
}

/**
 * Porta de entrada do convite.
 * Convite inexistente ou desativado mostra o mesmo aviso neutro,
 * sem revelar detalhes internos do sistema.
 */
export function PublicInviteView({ token }: PublicInviteViewProps) {
  const { data: client, loading, error, reload } = useClientByToken(token);

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-surface-muted px-4">
        <div className="flex flex-col items-center gap-3 text-ink-500">
          <Spinner className="size-6 text-brand-700" />
          <p className="text-sm">Carregando formulário...</p>
        </div>
      </main>
    );
  }

  // Falha de rede nao pode ser confundida com convite desativado.
  if (error) {
    return (
      <main className="safe-x flex min-h-dvh items-center justify-center bg-surface-muted px-4 py-12">
        <div className="w-full max-w-md animate-rise rounded-card border border-line bg-surface p-6 text-center shadow-card sm:p-8">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-danger-50 text-danger-600"
          >
            <WifiOff className="size-6" />
          </span>
          <h1 className="text-lg font-semibold text-ink-900">Não foi possível carregar</h1>
          <p className="mt-2 text-sm text-balance text-ink-500">{error}</p>
          <Button variant="secondary" fullWidth className="mt-6" onClick={reload}>
            Tentar novamente
          </Button>
          <p className="mt-6 text-xs text-ink-400">{appConfig.shortName}</p>
        </div>
      </main>
    );
  }

  if (!client || !client.invite.active) {
    return <InviteUnavailable />;
  }

  return <PublicFormView client={client} />;
}

function InviteUnavailable() {
  return (
    <main className="safe-x flex min-h-dvh items-center justify-center bg-surface-muted px-4 py-12">
      <div className="w-full max-w-md animate-rise rounded-card border border-line bg-surface p-6 text-center shadow-card sm:p-8">
        <span
          aria-hidden="true"
          className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-ink-100 text-ink-500"
        >
          <Link2Off className="size-6" />
        </span>
        <h1 className="text-lg font-semibold text-ink-900">Convite indisponível</h1>
        <p className="mt-2 text-sm text-balance text-ink-500">
          Este link não está ativo no momento. Peça um novo link ao responsável pelo cadastro.
        </p>
        <p className="mt-6 text-xs text-ink-400">{appConfig.shortName}</p>
      </div>
    </main>
  );
}
