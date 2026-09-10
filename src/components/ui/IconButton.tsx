'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

type Variant = 'ghost' | 'secondary' | 'danger';

const VARIANTS: Record<Variant, string> = {
  ghost: 'text-ink-500 hover:bg-ink-100 hover:text-ink-900',
  secondary: 'border border-line-strong bg-surface text-ink-700 hover:bg-ink-50',
  danger: 'text-danger-600 hover:bg-danger-50',
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Obrigatorio: o botao mostra apenas um icone. */
  label: string;
  icon: ReactNode;
  variant?: Variant;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      title={label}
      aria-label={label}
      className={cn(
        'tap inline-flex items-center justify-center rounded-control',
        'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
});
