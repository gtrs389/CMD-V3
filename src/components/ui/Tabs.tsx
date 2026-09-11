'use client';

import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

interface TabsProps {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  /** Rotulo do conjunto, lido por tecnologia assistiva. */
  label: string;
  /**
   * `pill`: pastilha azul na aba ativa.
   * `underline`: faixa branca com linha azul sob a aba ativa.
   */
  variant?: 'pill' | 'underline';
}

/**
 * Abas navegaveis por teclado. No celular a faixa rola horizontalmente
 * dentro do proprio contorno, sem empurrar a largura da pagina.
 */
export function Tabs({ items, active, onChange, label, variant = 'pill' }: TabsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = items[(index + delta + items.length) % items.length];
    onChange(next.id);
    refs.current[next.id]?.focus();
  }

  const underline = variant === 'underline';

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'scrollbar-slim flex overflow-x-auto',
        underline
          ? 'rounded-card border border-line bg-surface px-1 shadow-card sm:px-2'
          : '-mx-4 gap-1 px-4 sm:mx-0 sm:px-0',
      )}
    >
      {items.map((item, index) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[item.id] = node;
            }}
            role="tab"
            type="button"
            id={`tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`painel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-medium whitespace-nowrap',
              'transition-colors duration-150',
              underline
                ? [
                    'grow basis-auto justify-center border-b-2 px-3 py-1.5',
                    selected
                      ? 'border-accent-600 text-accent-700'
                      : 'border-transparent text-ink-500 hover:text-ink-900',
                  ]
                : [
                    'rounded-control px-3',
                    selected
                      ? 'bg-brand-700 text-white shadow-card'
                      : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900',
                  ],
            )}
          >
            {item.icon}
            {item.label}
            {item.badge}
          </button>
        );
      })}
    </div>
  );
}

interface TabPanelProps {
  id: string;
  active: string;
  children: ReactNode;
}

export function TabPanel({ id, active, children }: TabPanelProps) {
  if (id !== active) return null;
  return (
    <div
      role="tabpanel"
      id={`painel-${id}`}
      aria-labelledby={`tab-${id}`}
      tabIndex={0}
      /* Sem animacao de entrada: a troca de aba precisa ser instantanea e o
         conteudo nunca pode ficar invisivel se a aba estiver em segundo plano
         (o navegador congela animacoes em abas nao visiveis). */
      className="focus:outline-none"
    >
      {children}
    </div>
  );
}
