'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin as MapPinIcon, RefreshCw } from 'lucide-react';
import {
  DEFAULT_MAP_FILTER,
  filterPins,
  MAP_FILTERS,
  MAP_FILTER_LABELS,
  type MapFilter,
  type MapOverviewPayload,
  type PollingPlacePin,
} from '@/lib/domain/map-pin';
import { PlaceMembersPanel } from './PlaceMembersPanel';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/text';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Mapa da mobilizacao.
 *
 * O desenho do mapa so existe no navegador: o Leaflet depende de `window`,
 * entao o componente e carregado sem renderizacao no servidor.
 */
const MapCanvas = dynamic(() => import('./MapCanvas'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

export function MobilizationMap() {
  const [filter, setFilter] = useState<MapFilter>(DEFAULT_MAP_FILTER);
  const [resolving, setResolving] = useState(false);

  const loader = useCallback(() => api<MapOverviewPayload>('/api/mapa'), []);
  const { data, loading, error, reload } = useRepositoryQuery<MapOverviewPayload>(loader);

  const [openPlace, setOpenPlace] = useState<PollingPlacePin | null>(null);

  // Moradia continua sendo um pino por pessoa; local de votacao, um por escola.
  const pins = useMemo(
    () => (filter === 'POLLING_PLACE' ? [] : filterPins(data?.pins ?? [], 'RESIDENCE')),
    [data, filter],
  );
  const places = useMemo(
    () => (filter === 'RESIDENCE' ? [] : (data?.pollingPlaces ?? [])),
    [data, filter],
  );
  const totals = data?.totals;
  const pendentes = (totals?.pending ?? 0) + (totals?.notFound ?? 0);

  async function localizar() {
    if (resolving) return;
    setResolving(true);
    try {
      await api('/api/mapa', { method: 'POST', body: { action: 'pending' } });
      reload();
    } catch {
      reload();
    } finally {
      setResolving(false);
    }
  }

  return (
    <section
      aria-labelledby="mapa-mobilizacao"
      className="rounded-card border border-line bg-surface shadow-card"
    >
      <header className="flex flex-col gap-3 border-b border-line p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="mapa-mobilizacao"
              className="flex items-center gap-2 text-sm font-semibold text-ink-900"
            >
              <MapPinIcon aria-hidden="true" className="size-4 text-brand-700" />
              Mapa da mobilização
            </h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Distribuição dos integrantes por local de votação
            </p>
          </div>

          {pendentes > 0 ? (
            <Button variant="secondary" onClick={localizar} disabled={resolving}>
              {resolving ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />}
              Localizar cadastros pendentes
            </Button>
          ) : null}
        </div>

        <div role="group" aria-label="Tipo de localização" className="flex flex-wrap gap-1.5">
          {MAP_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
              className={cn(
                'inline-flex min-h-9 items-center rounded-pill border px-3 text-xs font-medium transition-colors',
                filter === option
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : 'border-line bg-surface text-ink-700 hover:bg-ink-50',
              )}
            >
              {MAP_FILTER_LABELS[option]}
            </button>
          ))}
        </div>

        {totals ? (
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
            <div className="flex gap-1">
              <dt>Moradia localizada:</dt>
              <dd className="font-semibold text-ink-900">{formatNumber(totals.residence)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Local de votação:</dt>
              <dd className="font-semibold text-ink-900">{formatNumber(totals.pollingPlace)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Pendentes ou não localizados:</dt>
              <dd className="font-semibold text-ink-900">{formatNumber(pendentes)}</dd>
            </div>
          </dl>
        ) : null}
      </header>

      <div className="relative h-[360px] w-full overflow-hidden sm:h-[420px] lg:h-[520px]">
        {loading ? (
          <Skeleton className="h-full w-full rounded-none" />
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="text-sm text-ink-500">Não foi possível carregar o mapa.</p>
            <Button variant="secondary" onClick={reload}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <>
            {/* O mapa fica sempre na tela, mesmo sem pino no filtro. */}
            <MapCanvas pins={pins} places={places} onOpenPlace={setOpenPlace} />

            {pins.length === 0 && places.length === 0 ? (
              <p className="pointer-events-none absolute inset-x-3 top-3 z-[500] rounded-control border border-line bg-surface/95 px-3 py-2 text-center text-xs text-ink-700 shadow-card">
                Nenhuma localização neste filtro ainda. Nenhuma posição é estimada.
              </p>
            ) : null}
          </>
        )}
      </div>

      {openPlace ? (
        <PlaceMembersPanel place={openPlace} onClose={() => setOpenPlace(null)} />
      ) : null}
    </section>
  );
}
