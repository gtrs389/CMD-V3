import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';

interface StatCardProps {
  label: string;
  value: number;
  hint: string;
  icon: ReactNode;
  loading?: boolean;
}

/** Indicador numerico. Mostra apenas dados que existem nesta etapa. */
export function StatCard({ label, value, hint, icon, loading }: StatCardProps) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-500">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-16" />
          ) : (
            <p className="mt-1 text-3xl font-semibold tracking-tight text-ink-900 tabular-nums">
              {value}
            </p>
          )}
        </div>
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-50 text-brand-700"
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-xs text-ink-500">{hint}</p>
    </div>
  );
}
