'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/permissions';
import { initials } from '@/lib/utils/text';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSession } from './SessionProvider';

/** Identificacao da sessao e saida do painel, no rodape da barra lateral. */
export function UserMenu() {
  const { user, signOut, restoring } = useSession();
  const [confirming, setConfirming] = useState(false);

  if (!user) return null;

  return (
    <>
      <div className="flex items-center gap-2 px-1">
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy-600 text-[0.625rem] font-semibold text-white"
        >
          {initials(user.name)}
        </span>
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-white" title={user.email}>
          {ROLE_LABELS[user.role]}
        </p>
      </div>

      <button
        type="button"
        disabled={restoring}
        onClick={() => setConfirming(true)}
        className="mt-2 flex min-h-9 w-full items-center gap-2.5 rounded-control px-3 text-xs font-medium text-navy-200 transition-colors hover:bg-navy-700 hover:text-white disabled:opacity-60"
      >
        <LogOut aria-hidden="true" className="size-4 shrink-0" />
        Sair
      </button>

      <ConfirmDialog
        open={confirming}
        title="Sair do painel"
        description="Você precisará entrar novamente para acessar as áreas administrativas."
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
