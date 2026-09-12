'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface LoadingOverlayProps {
  open: boolean;
  title: string;
  description?: string;
  /** Icone no centro do anel. Sem ele, fica so o anel girando. */
  icon?: ReactNode;
}

/**
 * Aviso de trabalho em andamento, no meio da tela.
 *
 * Cobre a pagina inteira de proposito: enquanto ele esta la, a pessoa sabe
 * que o sistema esta fazendo algo e nao fica clicando de novo. Sai sozinho
 * quando a acao termina.
 *
 * O anel gira e a onda se abre do centro; quem pediu menos movimento no
 * sistema ve tudo parado, porque `prefers-reduced-motion` desliga as
 * animacoes em `globals.css`. Leitores de tela recebem o texto por
 * `aria-live`.
 */
export function LoadingOverlay({ open, title, description, icon }: LoadingOverlayProps) {
  // A pagina atras nao rola enquanto o aviso esta na frente.
  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[60] flex items-center justify-center px-6"
    >
      <div aria-hidden="true" className="absolute inset-0 animate-fade-in bg-ink-900/55 backdrop-blur-[3px]" />

      <div className="relative flex w-full max-w-xs animate-scale-in flex-col items-center gap-5 rounded-card bg-surface px-7 py-9 text-center shadow-overlay">
        <span className="relative flex size-16 shrink-0 items-center justify-center">
          <span aria-hidden="true" className="absolute inset-0 animate-ripple rounded-full bg-accent-400/30" />
          <span aria-hidden="true" className="absolute inset-0 rounded-full border-2 border-accent-100" />
          <span
            aria-hidden="true"
            className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-accent-600"
          />
          <span aria-hidden="true" className="relative text-accent-600">
            {icon}
          </span>
        </span>

        <div className="space-y-1.5">
          <p className="text-base font-semibold text-ink-900">{title}</p>
          {description ? <p className="text-sm text-balance text-ink-500">{description}</p> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
