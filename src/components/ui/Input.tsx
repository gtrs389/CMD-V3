'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export const CONTROL_CLASSES =
  'w-full min-h-11 rounded-control border border-line-strong bg-surface px-3 py-2 ' +
  'text-ink-900 placeholder:text-ink-400 transition-colors duration-150 ' +
  'hover:border-ink-400 focus:border-brand-500 focus:outline-none ' +
  'focus:ring-2 focus:ring-brand-500/25 disabled:cursor-not-allowed disabled:bg-ink-50 ' +
  'disabled:text-ink-500';

export const CONTROL_ERROR_CLASSES =
  'border-danger-600 focus:border-danger-600 focus:ring-danger-600/20';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** Elemento fixo a direita do campo (ex.: botao de mostrar senha). */
  trailing?: ReactNode;
  /**
   * Icone fixo a esquerda, apenas decorativo.
   *
   * Serve para dar uma pista rapida do que o campo pede — telefone, documento,
   * endereco. Nunca substitui o rotulo: quem usa leitor de tela continua
   * ouvindo o `label`, e o icone fica fora da leitura.
   */
  leading?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, trailing, leading, className, ...props },
  ref,
) {
  const input = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL_CLASSES,
        invalid && CONTROL_ERROR_CLASSES,
        leading ? 'pl-10' : undefined,
        trailing ? 'pr-12' : undefined,
        className,
      )}
      {...props}
    />
  );

  if (!trailing && !leading) return input;

  return (
    <div className="relative flex w-full items-center">
      {leading ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 flex items-center text-ink-400"
        >
          {leading}
        </span>
      ) : null}

      {input}

      {trailing ? <div className="absolute right-1 flex items-center">{trailing}</div> : null}
    </div>
  );
});
