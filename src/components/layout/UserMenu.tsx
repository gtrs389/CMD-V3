'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, KeyRound, LogOut } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/permissions';
import { initials } from '@/lib/utils/text';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ChangePasswordModal } from './ChangePasswordModal';
import { useSession } from './SessionProvider';

/**
 * Botao de usuario do canto superior direito.
 *
 * Reune identificacao, troca de senha e saida do painel em um unico menu,
 * presente em todas as telas autenticadas.
 */
export function UserMenu() {
  const { user, signOut, restoring } = useSession();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Conta de ${user.name}`}
        onClick={() => setOpen((state) => !state)}
        className="inline-flex min-h-10 items-center gap-2 rounded-pill border border-line bg-surface py-1 pr-2 pl-1 text-sm font-medium text-ink-900 shadow-card transition-colors hover:bg-ink-50"
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[0.6875rem] font-semibold text-white"
        >
          {initials(user.name)}
        </span>
        <span className="hidden max-w-36 truncate sm:block">{user.name}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ink-500" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-60 animate-scale-in overflow-hidden rounded-control border border-line bg-surface py-1 shadow-overlay"
        >
          <div className="border-b border-line px-3 py-2">
            <p className="truncate text-sm font-semibold text-ink-900">{user.name}</p>
            <p className="truncate text-xs text-ink-500">{user.email}</p>
            <p className="mt-1 text-xs font-medium text-ink-700">{ROLE_LABELS[user.role]}</p>
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setChangingPassword(true);
            }}
            className="flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-sm text-ink-700 transition-colors hover:bg-ink-100"
          >
            <KeyRound aria-hidden="true" className="size-4 shrink-0 text-ink-500" />
            Alterar senha
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={restoring}
            onClick={() => {
              setOpen(false);
              setConfirming(true);
            }}
            className="flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-sm text-ink-700 transition-colors hover:bg-ink-100 disabled:opacity-60"
          >
            <LogOut aria-hidden="true" className="size-4 shrink-0 text-ink-500" />
            Sair
          </button>
        </div>
      ) : null}

      <ChangePasswordModal open={changingPassword} onClose={() => setChangingPassword(false)} />

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
    </div>
  );
}
