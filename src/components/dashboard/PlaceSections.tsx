'use client';

import type { PollingPlacePin } from '@/lib/domain/map-pin';
import { sectionLabel, sectionVotes } from '@/lib/domain/map-pin';
import { formatNumber } from '@/lib/utils/text';

/**
 * A mesma estimativa, quebrada por zona e secao eleitoral.
 *
 * Uma escola atende varias secoes, e e a secao que decide onde cada cabine
 * fica e quantos mesarios a campanha precisa. A soma fecha com o total da
 * escola: quem nao informou zona ou secao aparece em uma linha propria, em
 * vez de sumir da conta.
 */
export function PlaceSections({
  place,
  compact = false,
  limite,
}: {
  place: PollingPlacePin;
  compact?: boolean;
  /** Mostra so as N secoes com mais votos; o resto vira "e mais N". */
  limite?: number;
}) {
  const todas = sectionVotes(place);
  if (todas.length === 0) return null;
  const linhas = limite ? [...todas].sort((a, b) => b.total - a.total).slice(0, limite) : todas;
  const resto = todas.length - linhas.length;

  return (
    <div className={compact ? 'mt-2' : 'mt-3'}>
      <p className="text-[0.625rem] font-semibold tracking-wide text-brand-800 uppercase">
        Por seção
      </p>
      <dl className="mt-1 space-y-0.5">
        {linhas.map((linha) => (
          <div
            key={sectionLabel(linha)}
            className="flex items-baseline justify-between gap-3 text-xs"
          >
            <dt className="min-w-0 truncate text-ink-500">{sectionLabel(linha)}</dt>
            <dd className="shrink-0 font-semibold text-ink-900 tabular-nums">
              {formatNumber(linha.total)}
            </dd>
          </div>
        ))}
      </dl>
      {resto > 0 ? (
        <p className="mt-0.5 text-[0.6875rem] text-ink-500">
          e mais {formatNumber(resto)} {resto === 1 ? 'seção' : 'seções'} — todas no PDF
        </p>
      ) : null}
    </div>
  );
}
