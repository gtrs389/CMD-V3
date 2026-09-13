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
}: {
  place: PollingPlacePin;
  compact?: boolean;
}) {
  const linhas = sectionVotes(place);
  if (linhas.length === 0) return null;

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
    </div>
  );
}
