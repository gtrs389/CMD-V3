'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { createId } from '@/lib/utils/id';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { wrapper: string; icon: ReactNode }> = {
  success: {
    wrapper: 'border-success-600/20 bg-success-50 text-success-700',
    icon: <CheckCircle2 className="size-5 shrink-0" />,
  },
  error: {
    wrapper: 'border-danger-200 bg-danger-50 text-danger-700',
    icon: <AlertCircle className="size-5 shrink-0" />,
  },
  info: {
    wrapper: 'border-line bg-surface text-ink-900',
    icon: <Info className="size-5 shrink-0 text-brand-700" />,
  },
};

/** Feedback imediato apos cada operacao. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = createId('tst');
      setItems((current) => [...current.slice(-2), { id, tone, message }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 4000),
      );
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (message: string) => push('success', message),
      error: (message: string) => push('error', message),
      info: (message: string) => push('info', message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        aria-live="polite"
        aria-atomic="false"
        /* No celular os avisos ficam no topo para nunca cobrir o rodape de
           acoes de um painel inferior; no desktop, no canto inferior direito. */
        className="safe-top pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:top-auto sm:right-0 sm:bottom-0 sm:items-end sm:safe-bottom"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className={cn(
              'pointer-events-auto flex w-full max-w-sm animate-scale-in items-start gap-3 rounded-control border px-4 py-3 shadow-overlay',
              TONE_STYLES[item.tone].wrapper,
            )}
          >
            {TONE_STYLES[item.tone].icon}
            <p className="min-w-0 flex-1 text-sm font-medium break-words">{item.message}</p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Fechar aviso"
              className="-m-1 shrink-0 rounded p-1 opacity-70 transition-opacity hover:opacity-100"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast precisa estar dentro de <ToastProvider>.');
  return context;
}
