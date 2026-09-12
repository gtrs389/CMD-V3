'use client';

import { useId, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/** Cor do circulo do icone, nos cartoes em bloco. */
export type RadioCardTone = 'sky' | 'rose' | 'violet' | 'neutral';

const TONE_CLASSES: Record<RadioCardTone, string> = {
  sky: 'bg-sky-50 text-sky-600',
  rose: 'bg-rose-50 text-rose-600',
  violet: 'bg-violet-50 text-violet-600',
  neutral: 'bg-ink-100 text-ink-500',
};

export interface RadioCardOption {
  id: string;
  label: string;
  /** Somente nos cartoes em bloco. Decorativo: o rotulo continua sendo o texto. */
  icon?: ReactNode;
  tone?: RadioCardTone;
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
  /**
   * `row`: marcador redondo e rotulo lado a lado (painel).
   * `tile`: cartao em bloco, com o icone acima do rotulo (cadastro publico).
   */
  appearance?: 'row' | 'tile';
}

/**
 * Escolha unica em cartoes.
 *
 * Continua sendo um grupo de `radio` de verdade: cada cartao e um `input`
 * visualmente oculto com o rotulo por cima, entao teclado e leitor de tela
 * funcionam como em qualquer campo. Os icones sao decorativos e nunca
 * carregam sozinhos o significado da opcao.
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
  appearance = 'row',
}: RadioCardGroupProps) {
  const groupId = useId();
  const tile = appearance === 'tile';

  if (options.length === 0) {
    return <p className="text-sm text-ink-500">Nenhuma opção cadastrada para este campo.</p>;
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={cn(
        'grid gap-2.5',
        tile ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4',
      )}
    >
      {options.map((option) => {
        const selected = value === option.id;
        const inputId = `${idPrefix}-${groupId}-${option.id}`;

        return (
          <label
            key={option.id}
            htmlFor={inputId}
            className={cn(
              'relative cursor-pointer rounded-card border bg-surface transition-all',
              'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
              tile
                ? 'flex min-h-[5.5rem] flex-col items-center justify-center gap-2 px-2 py-3.5'
                : 'flex min-h-11 items-center gap-2 px-3 py-2.5',
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

            {tile ? (
              <>
                {/* Confirmacao no canto: a cor sozinha nunca diz o que esta
                    escolhido. */}
                {selected ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-brand-700 text-white"
                  >
                    <Check className="size-3" />
                  </span>
                ) : null}

                {option.icon ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-10 items-center justify-center rounded-full transition-colors',
                      TONE_CLASSES[option.tone ?? 'neutral'],
                    )}
                  >
                    {option.icon}
                  </span>
                ) : null}

                <span
                  className={cn(
                    'text-center text-[0.8125rem] leading-tight',
                    selected ? 'font-semibold text-brand-800' : 'text-ink-700',
                  )}
                >
                  {option.label}
                </span>
              </>
            ) : (
              <>
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
              </>
            )}
          </label>
        );
      })}
    </div>
  );
}
