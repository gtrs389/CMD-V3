'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Maximize2, MapPin as MapPinIcon, RefreshCw, SlidersHorizontal, Trophy, X } from 'lucide-react';
import {
  DEFAULT_MAP_QUERY,
  activeFilterCount,
  applyMapQuery,
  mapOptions,
  type MapQuery,
} from '@/lib/domain/map-filters';
import type { MapOverviewPayload, PollingPlacePin } from '@/lib/domain/map-pin';
import type { MapFocus } from './MapCanvas';
import { MapControlButton, MapControlStack, MapPanel } from './MapControls';
import { MapFiltersBar } from './MapFiltersBar';
import { MapRanking } from './MapRanking';
import { MemberSheetModal } from './MemberSheetModal';
import { PlaceMembersPanel } from './PlaceMembersPanel';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/text';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useSession } from '@/components/layout/SessionProvider';
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

interface MobilizationMapProps {
  /** Restringe o mapa a equipe de um unico time. */
  clientId?: string;
}

/**
 * Cartao do mapa.
 *
 * Tres partes, e cada uma sabe fazer so a sua: os FILTROS decidem o recorte,
 * o recorte e calculado em um modulo puro (`@/lib/domain/map-filters`) e o
 * resultado alimenta ao mesmo tempo o mapa e o ranking. E por isso que a
 * lista e o mapa nunca discordam: os dois leem o mesmo `applyMapQuery`.
 *
 * TELA CHEIA E DO MAPA, nao do cartao. O botao fica SOBRE os tiles, no canto,
 * junto com os outros controles — e em tela cheia o mapa ocupa a tela
 * inteira, de borda a borda, com cabecalho, filtros, ranking e contagem
 * flutuando por cima dele. Um cabecalho fixo empurrando o mapa para baixo
 * nao e tela cheia: e o mesmo cartao esticado.
 *
 * A arvore de elementos e a MESMA nos dois modos — cada bloco condicional
 * guarda o proprio lugar — entao o Leaflet nunca e remontado: posicao, zoom,
 * balao aberto e filtro sobrevivem a entrada e a saida.
 */
export function MobilizationMap({ clientId }: MobilizationMapProps = {}) {
  const { can } = useSession();
  const [query, setQuery] = useState<MapQuery>(DEFAULT_MAP_QUERY);
  const [resolving, setResolving] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  /** Coluna do ranking no CARTAO, onde ela tem espaco proprio. */
  const [showRanking, setShowRanking] = useState(true);
  /**
   * Paineis flutuantes da TELA CHEIA: os dois comecam fechados.
   *
   * Quem clicou em "tela cheia" quer ver o MAPA — nao um painel cobrindo um
   * terco dele. Os dois botoes ficam ali no canto, e o de filtros ainda
   * carrega o numero de filtros ligados: nada fica escondido sem aviso.
   *
   * Sao estados PROPRIOS, separados da coluna do cartao: abrir o ranking em
   * tela cheia nao mexe na coluna que o cartao mostra, e vice-versa.
   */
  const [showFilters, setShowFilters] = useState(false);
  const [showRankingFull, setShowRankingFull] = useState(false);

  // Localizar cadastro pendente aciona consulta paga: exclusivo do ADMIN.
  // O Administrador do time abre o mapa somente para ver.
  const podeLocalizar = can('map.resolve');

  const loader = useCallback(
    () =>
      api<MapOverviewPayload>(
        clientId ? `/api/mapa?clientId=${encodeURIComponent(clientId)}` : '/api/mapa',
      ),
    [clientId],
  );
  const { data, loading, error, reload } = useRepositoryQuery<MapOverviewPayload>(loader);

  const [openPlace, setOpenPlace] = useState<PollingPlacePin | null>(null);
  /**
   * Ficha aberta SOBRE o mapa.
   *
   * O pino e a lista da escola abrem a ficha aqui, e nao na pagina do time:
   * sair do mapa custaria a posicao, o zoom, o filtro e a propria escola
   * aberta — e a ficha e uma leitura rapida no meio da analise.
   */
  const [openMember, setOpenMember] = useState<string | null>(null);
  /** Local que o ranking mandou enquadrar. */
  const [focusPlace, setFocusPlace] = useState<MapFocus | null>(null);

  const options = useMemo(() => mapOptions(data, query.state), [data, query.state]);
  const selection = useMemo(() => applyMapQuery(data, query), [data, query]);

  const totals = data?.totals;
  const pendentes = (totals?.pending ?? 0) + (totals?.notFound ?? 0);
  /** Sem local de votacao na visao, o ranking nao teria o que ordenar. */
  const rankingDisponivel = query.kind !== 'RESIDENCE';
  const comRanking = rankingDisponivel && (fullscreen ? showRankingFull : showRanking);
  const pronto = !loading && !error;

  // Tela cheia: a pagina atras nao rola, e Escape fecha. Sem isso, arrastar o
  // mapa no celular acabaria rolando o painel embaixo dele.
  useEffect(() => {
    if (!fullscreen) return;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

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

  function focar(place: PollingPlacePin) {
    setFocusPlace({
      locationId: place.locationId,
      latitude: place.latitude,
      longitude: place.longitude,
      nonce: Date.now(),
    });
  }

  /**
   * Entrar e sair da tela cheia sempre comeca com o mapa limpo.
   *
   * Os paineis flutuantes sao da tela cheia, e cada abertura recomeca sem
   * eles: o mapa e o motivo de estar ali.
   */
  function alternarTelaCheia() {
    setShowFilters(false);
    setShowRankingFull(false);
    setFullscreen((atual) => !atual);
  }

  const painelRanking = (
    <MapRanking
      places={selection.places}
      zone={query.zone}
      activeId={focusPlace?.locationId ?? null}
      onFocus={focar}
      // A altura vem de quem envolve (o flex estica o filho); a largura
      // precisa ser pedida, porque em linha o flex nao estica na horizontal.
      className="w-full"
    />
  );

  const contagem = totals ? (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
      {/* O primeiro numero e o do RECORTE: e ele que responde "quanto voto
          tem aqui dentro". Os totais do time vem depois. */}
      <div className="flex gap-1">
        <dt>Votos no filtro:</dt>
        <dd className="font-semibold text-brand-800">{formatNumber(selection.votes)}</dd>
      </div>
      <div className="flex gap-1">
        <dt>Pessoas no filtro:</dt>
        <dd className="font-semibold text-ink-900">{formatNumber(selection.pins.length)}</dd>
      </div>
      <div className="flex gap-1">
        <dt>Locais no filtro:</dt>
        <dd className="font-semibold text-ink-900">{formatNumber(selection.placeCount)}</dd>
      </div>
      <div className="flex gap-1">
        <dt>Pendentes ou não localizados:</dt>
        <dd className="font-semibold text-ink-900">{formatNumber(pendentes)}</dd>
      </div>
    </dl>
  ) : null;

  return (
    <section
      aria-label="Mapa da mobilização"
      className={cn(
        'bg-surface',
        fullscreen
          ? 'fixed inset-0 z-[45]'
          : 'rounded-card border border-line shadow-card',
      )}
    >
      {/* Cabecalho do CARTAO. Em tela cheia ele nao existe: o que ele
          carregava passa a flutuar sobre o proprio mapa. */}
      {!fullscreen ? (
        <header className="flex shrink-0 flex-col gap-3 border-b border-line p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <MapPinIcon aria-hidden="true" className="size-4 text-brand-700" />
                Mapa da mobilização
              </h2>
              <p className="mt-0.5 text-xs text-ink-500">
                Distribuição dos integrantes por localização cadastrada e local de votação
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {podeLocalizar && pendentes > 0 ? (
                <Button variant="secondary" onClick={localizar} disabled={resolving}>
                  {resolving ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />}
                  Localizar cadastros pendentes
                </Button>
              ) : null}

              {rankingDisponivel ? (
                <button
                  type="button"
                  aria-pressed={showRanking}
                  onClick={() => setShowRanking((atual) => !atual)}
                  className={cn(
                    'inline-flex min-h-9 items-center gap-1.5 rounded-pill border px-3 text-xs font-medium transition-colors',
                    showRanking
                      ? 'border-brand-700 bg-brand-50 text-brand-800'
                      : 'border-line bg-surface text-ink-700 hover:bg-ink-50',
                  )}
                >
                  <Trophy aria-hidden="true" className="size-3.5" />
                  Ranking
                </button>
              ) : null}
            </div>
          </div>

          <MapFiltersBar query={query} onChange={setQuery} options={options} dense />

          {contagem}
        </header>
      ) : null}

      <div
        className={cn(
          'flex w-full flex-col lg:flex-row',
          fullscreen
            ? 'absolute inset-0'
            : 'h-[360px] overflow-hidden sm:h-[420px] lg:h-[520px]',
        )}
      >
        <div className="relative min-h-0 flex-1 overflow-hidden">
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
              <MapCanvas
                pins={selection.pins}
                places={selection.places}
                onOpenPlace={setOpenPlace}
                onOpenMember={setOpenMember}
                focusPlace={focusPlace}
                resizeKey={`${fullscreen ? 'full' : 'card'}:${comRanking ? 'rank' : 'solo'}`}
              />

              {selection.pins.length === 0 && selection.places.length === 0 ? (
                <p className="pointer-events-none absolute inset-x-3 top-16 z-[1050] rounded-control border border-line bg-surface/95 px-3 py-2 text-center text-xs text-ink-700 shadow-card">
                  Nenhuma localização neste filtro ainda. Nenhuma posição é estimada.
                </p>
              ) : null}
            </>
          )}

          {/* CONTROLES DO MAPA, sobre os tiles. */}
          {pronto ? (
            <MapControlStack corner="top-right">
              <MapControlButton
                label={fullscreen ? 'Fechar' : 'Tela cheia'}
                icon={fullscreen ? <X className="size-4" /> : <Maximize2 className="size-4" />}
                active={fullscreen}
                onClick={alternarTelaCheia}
              />

              {/* Em tela cheia nao ha cabecalho: filtros e ranking passam a
                  ser controles do mapa tambem. */}
              {fullscreen ? (
                <MapControlButton
                  label="Filtros"
                  icon={<SlidersHorizontal className="size-4" />}
                  active={showFilters}
                  badge={activeFilterCount(query)}
                  onClick={() => setShowFilters((atual) => !atual)}
                />
              ) : null}

              {fullscreen && rankingDisponivel ? (
                <MapControlButton
                  label="Ranking"
                  icon={<Trophy className="size-4" />}
                  active={showRankingFull}
                  onClick={() => setShowRankingFull((atual) => !atual)}
                />
              ) : null}
            </MapControlStack>
          ) : null}

          {/* Filtros flutuantes: so existem em tela cheia. */}
          {fullscreen && pronto && showFilters ? (
            <MapPanel side="left" className="top-16 max-h-[calc(100%-5rem)]">
              <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                  <MapPinIcon aria-hidden="true" className="size-4 text-brand-700" />
                  Mapa da mobilização
                </h2>
                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  aria-label="Fechar filtros"
                  className="tap flex items-center justify-center rounded-control text-ink-500 hover:bg-ink-100"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </div>

              <div className="min-h-0 space-y-3 overflow-y-auto p-3">
                <MapFiltersBar query={query} onChange={setQuery} options={options} />

                {podeLocalizar && pendentes > 0 ? (
                  <Button variant="secondary" onClick={localizar} disabled={resolving} fullWidth>
                    {resolving ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />}
                    Localizar cadastros pendentes
                  </Button>
                ) : null}
              </div>
            </MapPanel>
          ) : null}

          {/* Ranking flutuante: so em tela cheia. No cartao ele e coluna. */}
          {fullscreen && pronto && comRanking ? (
            <MapPanel side="right" className="top-16 max-h-[calc(100%-5rem)]">
              {painelRanking}
            </MapPanel>
          ) : null}

          {/* A contagem do recorte acompanha o mapa em tela cheia: sem ela, o
              numero que responde "quanto voto tem aqui" sairia da vista. */}
          {fullscreen && pronto ? (
            <div className="safe-bottom pointer-events-none absolute bottom-3 left-3 z-[1100] max-w-[min(22rem,calc(100vw-1.5rem))] rounded-card border border-line bg-surface/95 px-3 py-2 shadow-overlay backdrop-blur">
              {contagem}
            </div>
          ) : null}
        </div>

        {/* Coluna do ranking: exclusiva do cartao no desktop. */}
        {!fullscreen && comRanking && pronto ? (
          <div className="hidden shrink-0 border-l border-line lg:flex lg:h-full lg:w-80">
            {painelRanking}
          </div>
        ) : null}
      </div>

      {/* Celular no cartao: o ranking fica FORA da area do mapa, para nao
          roubar altura dele. Rola sozinho e nao estica a pagina sem limite. */}
      {!fullscreen && comRanking && pronto ? (
        <div className="flex max-h-72 border-t border-line lg:hidden">{painelRanking}</div>
      ) : null}

      {openPlace ? (
        <PlaceMembersPanel
          place={openPlace}
          onOpenMember={setOpenMember}
          onClose={() => setOpenPlace(null)}
        />
      ) : null}

      {/* A ficha fica por cima de tudo: fechar devolve o mapa exatamente como
          estava, com a escola ainda aberta se era de la que ela veio. */}
      <MemberSheetModal memberId={openMember} onClose={() => setOpenMember(null)} />
    </section>
  );
}
