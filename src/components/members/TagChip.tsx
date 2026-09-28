import type { Tag, TagColor } from '@/lib/types';
import { cn } from '@/lib/utils/cn';

/** Fundo, texto e simbolo de cada cor do catalogo. */
export const ESTILO_DA_TAG: Record<TagColor, { chip: string; simbolo: string; amostra: string }> = {
  // A primeira tag do catalogo, Coordenador Delta Operacional: a insignia.
  navy: {
    chip: 'bg-navy-900 text-white ring-gold-400/60',
    simbolo: 'text-gold-400',
    amostra: 'bg-navy-900 ring-gold-400',
  },
  blue: { chip: 'bg-sky-50 text-sky-800 ring-sky-200', simbolo: 'text-sky-600', amostra: 'bg-sky-500 ring-sky-200' },
  green: {
    chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    simbolo: 'text-emerald-600',
    amostra: 'bg-emerald-500 ring-emerald-200',
  },
  orange: {
    chip: 'bg-orange-50 text-orange-800 ring-orange-200',
    simbolo: 'text-orange-600',
    amostra: 'bg-orange-500 ring-orange-200',
  },
  violet: {
    chip: 'bg-violet-50 text-violet-800 ring-violet-200',
    simbolo: 'text-violet-600',
    amostra: 'bg-violet-500 ring-violet-200',
  },
  rose: { chip: 'bg-rose-50 text-rose-800 ring-rose-200', simbolo: 'text-rose-600', amostra: 'bg-rose-500 ring-rose-200' },
  amber: {
    chip: 'bg-amber-50 text-amber-900 ring-amber-200',
    simbolo: 'text-amber-600',
    amostra: 'bg-amber-400 ring-amber-200',
  },
  slate: { chip: 'bg-slate-700 text-white ring-slate-500/40', simbolo: 'text-slate-200', amostra: 'bg-slate-700 ring-slate-300' },
};

/**
 * A tag de uma pessoa, como insignia: simbolo + nome, na cor do catalogo.
 *
 * Aparece AO LADO do nivel (Lider ou Equipe), nunca no lugar dele — a pessoa
 * continua sendo o que era.
 */
export function TagChip({
  tag,
  compacto = false,
  title,
  className,
}: {
  tag: Pick<Tag, 'name' | 'symbol' | 'color'>;
  compacto?: boolean;
  title?: string;
  className?: string;
}) {
  const estilo = ESTILO_DA_TAG[tag.color] ?? ESTILO_DA_TAG.navy;
  return (
    <span
      title={title ?? tag.name}
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-1 rounded-pill font-semibold whitespace-nowrap ring-1',
        estilo.chip,
        compacto ? 'px-2 py-0.5 text-[0.6875rem]' : 'px-2.5 py-1 text-xs',
        className,
      )}
    >
      {tag.symbol ? (
        <span aria-hidden="true" className={cn('font-bold', estilo.simbolo)}>
          {tag.symbol}
        </span>
      ) : null}
      <span className="truncate">{tag.name}</span>
    </span>
  );
}
