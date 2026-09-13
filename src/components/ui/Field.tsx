import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface FieldProps {
  id: string;
  label: string;
  help?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  /** Rotulo visualmente oculto, mantendo a leitura por tecnologia assistiva. */
  hideLabel?: boolean;
  /**
   * Conteudo curto a direita do rotulo, na mesma linha.
   *
   * Usado pela pagina publica para dizer, campo a campo, o que se espera
   * ali: preencher agora, aguardar o anterior, ja esta pronto. Fica na
   * linha do rotulo de proposito — e onde o olho ja esta quando chega no
   * campo.
   */
  aside?: ReactNode;
}

/** Envolve um controle com rotulo, texto de ajuda e mensagem de erro. */
export function Field({
  id,
  label,
  help,
  error,
  required,
  children,
  className,
  hideLabel,
  aside,
}: FieldProps) {
  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className={cn('text-sm font-medium text-ink-700', hideLabel && 'sr-only')}
        >
          {label}
          {required ? (
            <span className="ml-1 text-danger-600" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>

        {aside ? <span className="shrink-0">{aside}</span> : null}
      </div>

      {children}

      {help && !error ? (
        <p id={`${id}-help`} className="text-xs text-ink-500">
          {help}
        </p>
      ) : null}

      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, help?: string, error?: string): string | undefined {
  const parts: string[] = [];
  if (error) parts.push(`${id}-error`);
  else if (help) parts.push(`${id}-help`);
  return parts.length ? parts.join(' ') : undefined;
}
