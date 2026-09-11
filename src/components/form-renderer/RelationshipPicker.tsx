'use client';

import { useId } from 'react';
import type { FieldOption } from '@/lib/types';
import {
  RELATIONSHIP_COLOR_CLASSES,
  relationshipColor,
  relationshipIcon,
} from '@/lib/domain/relationship';
import { cn } from '@/lib/utils/cn';

interface RelationshipPickerProps {
  options: readonly FieldOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  /** Diferencia os IDs quando o campo aparece em mais de um lugar. */
  idPrefix: string;
  label: string;
}

/**
 * Escolha unica em cards.
 *
 * Continua sendo um grupo de `radio` de verdade: cada card e um `input`
 * visualmente oculto com o rotulo por cima, entao teclado e leitor de tela
 * funcionam como em qualquer campo. Tres colunas no desktop, duas no tablet
 * e uma no celular, com alvo de toque folgado.
 */
export function RelationshipPicker({
  options,
  value,
  onChange,
  disabled = false,
  invalid = false,
  describedBy,
  idPrefix,
  label,
}: RelationshipPickerProps) {
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
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {options.map((option) => {
        const Icon = relationshipIcon(option);
        const cor = relationshipColor(option);
        const selected = value === option.id;
        const inputId = `${idPrefix}-${groupId}-${option.id}`;

        return (
          <label
            key={option.id}
            htmlFor={inputId}
            className={cn(
              'relative flex min-h-[6.5rem] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-card border bg-surface px-3 py-4 text-center transition-colors',
              'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
              selected
                ? 'border-brand-700 bg-brand-50 shadow-card ring-1 ring-brand-700'
                : 'border-line hover:border-line-strong hover:bg-ink-50',
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
                'flex size-11 items-center justify-center rounded-full',
                RELATIONSHIP_COLOR_CLASSES[cor],
              )}
            >
              <Icon className="size-5" />
            </span>

            <span
              className={cn(
                'text-sm font-semibold',
                selected ? 'text-brand-800' : 'text-ink-900',
              )}
            >
              {option.label || 'Opção sem título'}
            </span>
          </label>
        );
      })}
    </div>
  );
}
