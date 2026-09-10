'use client';

import { useState } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/permissions';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSession } from './SessionProvider';

/** Identificacao da sessao e saida do painel. */
export function UserMenu() {
  const { user, signOut, restoring } = useSession();
  const [confirming, setConfirming] = useState(false);

  if (!user) return null;

  return (
    <>
      <div className="rounded-control bg-ink-50 p-3">
        <div className="flex items-center gap-2">
          <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-brand-700" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">{user.name}</p>
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-500">{user.email}</p>
        {ROLE_LABELS[user.role] !== user.name ? (
          <p className="mt-2 text-xs font-medium text-brand-700">{ROLE_LABELS[user.role]}</p>
        ) : null}

        <Button
          variant="secondary"
          size="sm"
          fullWidth
          className="mt-3"
          loading={restoring}
          onClick={() => setConfirming(true)}
        >
          <LogOut aria-hidden="true" className="size-4" />
          Sair
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Sair do painel"
        description="Voce precisara entrar novamente para acessar as areas administrativas."
        confirmLabel="Sair"
        tone="brand"
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          setConfirming(false);
          await signOut();
        }}
      />
    </>
  );
}
