'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { IconButton } from './IconButton';

type Size = 'sm' | 'md' | 'lg';

const SIZES: Record<Size, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: Size;
  children: ReactNode;
  footer?: ReactNode;
  /** Impede fechar por clique no fundo ou Escape (ex.: durante um envio). */
  busy?: boolean;
  /**
   * `default` separa cabecalho, conteudo e acoes por linhas.
   * `plain` tira as linhas e deixa tudo respirar: usado nos dialogos curtos,
   * de uma mensagem so, onde tres faixas empilhadas pesam mais do que
   * ajudam.
   */
  chrome?: 'default' | 'plain';
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Pilha dos dialogos abertos.
 *
 * Com um dialogo dentro de outro (uma confirmacao sobre um painel, por
 * exemplo), o Escape fecha somente o de cima: o de baixo continua aberto.
 */
const stack: symbol[] = [];

/**
 * Dialogo responsivo: painel inferior deslizante no celular e caixa
 * centralizada a partir de `sm`. Sempre com rolagem vertical propria.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
  busy = false,
  chrome = 'default',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const requestClose = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  useEffect(() => {
    if (!open) return;

    const id = Symbol('modal');
    stack.push(id);

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panelRef.current)?.focus();
    }, 30);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Apenas o dialogo do topo responde ao Escape.
        if (stack[stack.length - 1] !== id) return;
        event.stopPropagation();
        requestClose();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (item) => item.offsetParent !== null,
      );
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      const position = stack.indexOf(id);
      if (position >= 0) stack.splice(position, 1);

      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown, true);
      // A rolagem do fundo so volta quando nao ha mais dialogo aberto.
      if (stack.length === 0) document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, requestClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-ink-900/45"
        onClick={requestClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col bg-surface shadow-overlay',
          'animate-slide-up rounded-t-2xl sm:animate-scale-in sm:rounded-card',
          'border border-line/70 sm:border-line',
          SIZES[size],
        )}
      >
        {/* Alca do painel deslizante: so no celular, so como sinal visual de
            que da para arrastar/fechar. */}
        <span
          aria-hidden="true"
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-pill bg-ink-200 sm:hidden"
        />
        <div
          className={cn(
            'flex items-start justify-between gap-3 px-4 pt-4 sm:px-5',
            chrome === 'plain' ? 'pb-1' : 'border-b border-line pb-4',
          )}
        >
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
          </div>
          <IconButton
            label="Fechar"
            icon={<X className="size-5" />}
            onClick={requestClose}
            disabled={busy}
            className="-mr-2 -mt-1"
          />
        </div>

        <div
          className={cn(
            'scrollbar-slim min-h-0 flex-1 overflow-y-auto px-4 sm:px-5',
            chrome === 'plain' ? 'py-5' : 'py-4',
          )}
        >
          {children}
        </div>

        {footer ? (
          <div
            className={cn(
              'safe-bottom flex flex-col-reverse gap-2 px-4 pb-4 sm:flex-row sm:justify-end sm:px-5',
              chrome === 'plain' ? 'pt-1' : 'border-t border-line pt-3',
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
