'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { matchesSearch } from '@/lib/utils/text';
import { Spinner } from './Spinner';

export interface SelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  id: string;
  value: string;
  options: SelectOption[];
  placeholder: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Motivo do bloqueio, mostrado no lugar do texto de escolha. */
  disabledHint?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  invalid?: boolean;
  describedBy?: string;
  searchPlaceholder?: string;
  /** Abaixo deste total a busca nao aparece: a lista ja cabe na tela. */
  searchThreshold?: number;
}

/**
 * Lista suspensa com busca, para listas longas como municipios e bairros.
 *
 * Funciona por toque (nunca depende de hover), ocupa toda a largura e mantem
 * 44px de altura util nos alvos, como o restante dos controles do sistema.
 */
export function SearchableSelect({
  id,
  value,
  options,
  placeholder,
  onChange,
  disabled = false,
  disabledHint,
  loading = false,
  error = null,
  onRetry,
  invalid = false,
  describedBy,
  searchPlaceholder = 'Buscar',
  searchThreshold = 8,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = `${id}-lista`;
  const searchRef = useRef<HTMLInputElement>(null);

  const blocked = disabled || loading || Boolean(error);
  const selected = options.find((option) => option.value === value) ?? null;

  const filtered = useMemo(
    () => options.filter((option) => matchesSearch(term, option.label)),
    [options, term],
  );

  useEffect(() => {
    if (!open) return;

    searchRef.current?.focus();

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

  if (error) {
    return (
      <div
        className="flex flex-col gap-2 rounded-control border border-danger-200 bg-danger-50 p-3 sm:flex-row sm:items-center sm:justify-between"
        aria-describedby={describedBy}
      >
        <p role="alert" className="text-sm text-danger-700">
          {error}
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-line-strong bg-surface px-3 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
          >
            Tentar novamente
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-expanded={open}
        aria-describedby={describedBy}
        disabled={blocked}
        onClick={() => {
          setTerm('');
          setOpen((state) => !state);
        }}
        className={cn(
          'flex min-h-11 w-full items-center gap-2 rounded-control border border-line-strong bg-surface px-3 py-2 text-left',
          'transition-colors duration-150 hover:border-ink-400',
          'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500 disabled:hover:border-line-strong',
          invalid && 'border-danger-600',
        )}
      >
        {loading ? <Spinner className="size-4 shrink-0 text-ink-500" /> : null}
        <span className={cn('flex-1 truncate', selected ? 'text-ink-900' : 'text-ink-400')}>
          {loading
            ? 'Carregando...'
            : disabled && disabledHint
              ? disabledHint
              : (selected?.label ?? placeholder)}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ink-500" />
      </button>

      {open ? (
        <div className="absolute z-40 mt-1 w-full animate-scale-in overflow-hidden rounded-control border border-line bg-surface shadow-overlay">
          {options.length >= searchThreshold ? (
            <div className="relative flex items-center border-b border-line">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-ink-400" />
              <input
                ref={searchRef}
                type="search"
                value={term}
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                onChange={(event) => setTerm(event.target.value)}
                className="min-h-11 w-full bg-transparent pr-3 pl-9 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              />
            </div>
          ) : null}

          <ul id={listId} role="listbox" className="scrollbar-slim max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-ink-500">Nenhum resultado.</li>
            ) : (
              filtered.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm transition-colors hover:bg-ink-100',
                      option.value === value ? 'font-semibold text-ink-900' : 'text-ink-700',
                    )}
                  >
                    <Check
                      aria-hidden="true"
                      className={cn(
                        'size-4 shrink-0',
                        option.value === value ? 'text-brand-700' : 'invisible',
                      )}
                    />
                    <span className="truncate">{option.label}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
