'use client';

import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { CONTROL_CLASSES, CONTROL_ERROR_CLASSES } from './Input';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className, children, ...props },
  ref,
) {
  // A classe vai no CONTORNO, e nao no <select>: quem limita a largura
  // ("sm:max-w-56") precisa limitar os dois juntos. Aplicada so no <select>,
  // a caixa encolhia e a seta ficava la no fim da linha, solta.
  return (
    <div className={cn('relative flex w-full items-center', className)}>
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(CONTROL_CLASSES, 'appearance-none pr-10', invalid && CONTROL_ERROR_CLASSES)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 size-4 text-ink-500"
      />
    </div>
  );
});
