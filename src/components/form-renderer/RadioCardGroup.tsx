'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils/cn';

export interface RadioCardOption {
  id: string;
  label: string;
}

interface RadioCardGroupProps {
  options: readonly RadioCardOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  /** Diferencia os IDs quando o mesmo campo aparece em mais de um lugar. */
  idPrefix: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

/**
 * Escolha unica em cartoes com marcador redondo.
 *
 * Continua sendo um grupo de `radio` de verdade: cada cartao e um `input`
 * visualmente oculto com o rotulo por cima, entao teclado e leitor de tela
 * funcionam como em qualquer campo. As colunas vao de uma (celular estreito)
 * a quatro (desktop), sempre com 44px de altura util.
 */
export function RadioCardGroup({
  options,
  value,
  onChange,
  label,
  idPrefix,
  disabled = false,
  invalid = false,
  describedBy,
}: RadioCardGroupProps) {
  const groupId = useId();

  if (options.length === 0) {
    return <p className="text-sm text-ink-500">Nenhuma opção cadastrada para este campo.</p>;
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
    >
      {options.map((option) => {
        const selected = value === option.id;
        const inputId = `${idPrefix}-${groupId}-${option.id}`;

        return (
          <label
            key={option.id}
            htmlFor={inputId}
            className={cn(
              'flex min-h-11 cursor-pointer items-center gap-2 rounded-control border bg-surface px-3 py-2.5 transition-colors',
              'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
              selected
                ? 'border-brand-700 bg-brand-50 ring-1 ring-brand-700'
                : 'border-line-strong hover:border-ink-400 hover:bg-ink-50',
              disabled && 'cursor-not-allowed opacity-60',
              invalid && !selected && 'border-danger-600',
            )}
          >
            <input
              id={inputId}
              type="radio"
              name={`${idPrefix}-${groupId}`}
              value={option.id}
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(option.id)}
              className="sr-only"
            />

            <span
              aria-hidden="true"
              className={cn(
                'flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                selected ? 'border-brand-700' : 'border-line-strong',
              )}
            >
              {selected ? <span className="size-2.5 rounded-full bg-brand-700" /> : null}
            </span>

            <span
              className={cn(
                'min-w-0 text-sm leading-tight',
                selected ? 'font-semibold text-brand-800' : 'text-ink-900',
              )}
            >
              {option.label}
            </span>
          </label>
        );
      })}
    </div>
  );
}
