'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Maximize2, MapPin as MapPinIcon, RefreshCw, SlidersHorizontal, Trophy, X } from 'lucide-react';
import {
  DEFAULT_MAP_QUERY,
  activeFilterCount,
  applyMapQuery,
  mapOptions,
  placeVotes,
  type MapQuery,
} from '@/lib/domain/map-filters';
import type { MapOverviewPayload, PollingPlacePin } from '@/lib/domain/map-pin';
import { rotuloDoCandidato, type CandidatoDaVotacao, type VotacaoNoMapa } from '@/lib/domain/votacao-tse';
import type { MapFocus, ModoVotacao } from './MapCanvas';
import { MapControlButton, MapControlStack, MapPanel } from './MapControls';
import { MapFiltersBar } from './MapFiltersBar';
import { MapRanking } from './MapRanking';
import { MemberSheetPanel } from './MemberSheetPanel';
import { PlaceMembersPanel } from './PlaceMembersPanel';
import { MapaCarregando } from './MapaCarregando';
import {
  baixarPdfDaEscola,
  baixarPdfDaVotacao,
  baixarPdfDasPessoasPorEscola,
  baixarPdfDoRankingDeVotos,
} from './pdf-do-mapa';
import { BotaoDaVotacao } from './votacao/VotacaoTse';
import { api } from '@/lib/repositories/http/api';
import { useIsDesktop } from '@/hooks/use-desktop';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/text';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/components/layout/SessionProvider';
import { Spinner } from '@/components/ui/Spinner';
import { Contador } from '@/components/ui/Contador';

/**
 * Mapa da mobilizacao.
 *
 * O desenho do mapa so existe no navegador: o Leaflet depende de `window`,
 * entao o componente e carregado sem renderizacao no servidor.
 */
const MapCanvas = dynamic(() => import('./MapCanvas'), {
  ssr: false,
  // O pacote do mapa e pesado e chega depois do resto da pagina. Um retangulo
  // cinza no lugar nao diz nada: quem esperava nao sabia se o mapa estava
  // vindo ou se a tela tinha falhado.
  loading: () => <MapaCarregando texto="Carregando o mapa" />,
});

interface MobilizationMapProps {
  /** Restringe o mapa a equipe de um unico time. */
  clientId?: string;
  /**
   * Onde o mapa abre enquanto nao ha pino nenhum para enquadrar.
   *
   * O mapa geral nao pede nada e continua abrindo no centro do Brasil. A
   * pagina de um time pode pedir a propria regiao — e o que faz o Time DEMO,
   * que e todo de Alagoas, abrir em Alagoas.
   */
  fallbackCenter?: { latitude: number; longitude: number };
  /** Nome do time, no PDF da escola. */
  clientName?: string;
  /** Acoes do Lider no balao do pino dele (Equipe, inconsistencias, PDFs). */
  renderLiderActions?: (memberId: string) => ReactNode;
  /**
   * O mapa e o destaque da pagina (Visao geral do time): mais alto, com o
   * cabecalho em azul-marinho.
   */
  destaque?: boolean;
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
export function MobilizationMap({
  clientId,
  fallbackCenter,
  clientName,
  renderLiderActions,
  destaque = false,
}: MobilizationMapProps = {}) {
  const { can } = useSession();
  // Decide em qual dos dois lugares a ficha nasce: ao lado do mapa ou abaixo
  // dele. Sem isso, as duas copias existiriam e buscariam o integrante duas
  // vezes a cada abertura.
  const isDesktop = useIsDesktop();
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
   * Ficha aberta NA COLUNA LATERAL, no lugar do ranking.
   *
   * O pino e a lista da escola abrem a ficha aqui, e nao na pagina do time:
   * sair do mapa custaria a posicao, o zoom, o filtro e a propria escola
   * aberta — e a ficha e uma leitura rapida no meio da analise.
   *
   * Ela tambem nao abre mais como dialogo sobre o mapa: um dialogo cobre
   * justamente o que se estava olhando. A coluna do ranking ja e o lugar da
   * leitura auxiliar, entao a ficha ocupa essa coluna e fechar devolve o
   * ranking — sem o mapa se mexer.
   */
  const [openMember, setOpenMember] = useState<string | null>(null);
  /** Local que o ranking mandou enquadrar. */
  const [focusPlace, setFocusPlace] = useState<MapFocus | null>(null);

  /**
   * Bloco abaixo do mapa no celular.
   *
   * No desktop a ficha aparece ao lado, na mesma altura do olho. No celular
   * ela nasce abaixo do mapa, fora da vista — e quem clicou em "Ver ficha
   * completa" ficaria achando que o botao nao fez nada. A rolagem leva a
   * ficha ate ela.
   */
  const colunaCelular = useRef<HTMLDivElement | null>(null);

  /**
   * Votacao oficial do TSE de um candidato (2026).
   *
   * Escolhido um candidato, os pinos de escola passam a ser os votos DELE,
   * apurados secao por secao — e nao a estimativa da campanha. Filtros,
   * ranking e PDF continuam os mesmos, sobre esses numeros. Fechar volta ao
   * mapa da campanha.
   */
  const [candidato, setCandidato] = useState<CandidatoDaVotacao | null>(null);
  const loaderDaVotacao = useCallback(
    () =>
      candidato
        ? api<VotacaoNoMapa>(`/api/votacao/${encodeURIComponent(candidato.id)}`)
        : Promise.resolve(null),
    [candidato],
  );
  const consultaDaVotacao = useRepositoryQuery<VotacaoNoMapa | null>(loaderDaVotacao);
  // Trocando de candidato, a resposta do anterior ainda esta ali ate a nova
  // chegar: so vale a que e do candidato escolhido.
  const votacao =
    candidato && consultaDaVotacao.data?.candidato.id === candidato.id ? consultaDaVotacao.data : null;
  const erroVotacao = Boolean(candidato && !votacao && consultaDaVotacao.error);

  function escolherCandidato(escolhido: CandidatoDaVotacao | null) {
    setCandidato(escolhido);
    setFocusPlace(null);
    setOpenPlace(null);
    // Cidade, estado e busca da campanha nao valem para a votacao (os nomes
    // vem escritos de outro jeito na planilha do TSE): o recorte recomeca.
    setQuery((atual) => ({ ...atual, state: null, city: null, search: '' }));
  }

  const modoVotacao: ModoVotacao | undefined = candidato
    ? {
        rotulo: `Votos de ${candidato.nome} (${candidato.numero})`,
        nota: 'Resultado oficial do TSE, seção por seção',
      }
    : undefined;

  /** O que o mapa desenha: a campanha, ou a votacao do candidato escolhido. */
  const fonte = useMemo(
    () => (candidato ? { pins: [], pollingPlaces: votacao?.noMapa ?? [] } : data),
    [candidato, votacao, data],
  );
  /** Na votacao nao ha pessoa no mapa: so escolas. */
  const recorte = useMemo<MapQuery>(
    () => (candidato ? { ...query, kind: 'POLLING_PLACE' } : query),
    [candidato, query],
  );
  const options = useMemo(() => mapOptions(fonte, query.state), [fonte, query.state]);
  const selection = useMemo(() => applyMapQuery(fonte, recorte), [fonte, recorte]);
  /** Escolas da votacao sem coordenada, no mesmo recorte: so na conta e no PDF. */
  const foraDoMapa = useMemo(
    () => (votacao ? applyMapQuery({ pins: [], pollingPlaces: votacao.foraDoMapa }, recorte).places : []),
    [votacao, recorte],
  );
  const votosForaDoMapa = foraDoMapa.reduce((soma, place) => soma + placeVotes(place, recorte.zone), 0);

  const totals = data?.totals;
  const pendentes = (totals?.pending ?? 0) + (totals?.notFound ?? 0);
  /** Sem local de votacao na visao, o ranking nao teria o que ordenar. */
  const rankingDisponivel = recorte.kind !== 'RESIDENCE';
  const comRanking = rankingDisponivel && (fullscreen ? showRankingFull : showRanking);
  const pronto = !loading && !error && (!candidato || votacao !== null || erroVotacao);

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

  /**
   * Abre a ficha e fecha a lista da escola.
   *
   * A lista de pessoas de um local cobre a tela inteira (e uma folha, no
   * celular, e uma gaveta no desktop). Com ela aberta, a ficha nasceria na
   * coluna ATRAS dela — e quem clicou em "Ver ficha completa" veria a
   * mesma lista de sempre, achando que o botao nao fez nada.
   */
  function abrirFicha(memberId: string) {
    setOpenPlace(null);
    setOpenMember(memberId);
  }

  useEffect(() => {
    if (!openMember || fullscreen || isDesktop) return;
    colunaCelular.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [openMember, fullscreen, isDesktop]);

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

  const painelRanking = candidato ? (
    <MapRanking
      places={selection.places}
      zone={query.zone}
      activeId={focusPlace?.locationId ?? null}
      onFocus={focar}
      titulo={`Onde ${candidato.nome} teve mais votos`}
      nota="Resultado oficial do TSE, seção por seção. O PDF traz também os locais sem ponto no mapa."
      onDownload={() =>
        baixarPdfDaVotacao([...selection.places, ...foraDoMapa], query, {
          rotulo: rotuloDoCandidato(candidato),
          nome: candidato.nome,
          numero: candidato.numero,
        })
      }
      className="w-full"
    />
  ) : (
    <MapRanking
      places={selection.places}
      zone={query.zone}
      activeId={focusPlace?.locationId ?? null}
      onFocus={focar}
      onDownload={() => baixarPdfDoRankingDeVotos(selection.places, query, clientName ?? 'Mapa da mobilização')}
      onDownloadPeople={() =>
        baixarPdfDasPessoasPorEscola(selection.places, query, clientName ?? 'Mapa da mobilização', clientId)
      }
      // A altura vem de quem envolve (o flex estica o filho); a largura
      // precisa ser pedida, porque em linha o flex nao estica na horizontal.
      className="w-full"
    />
  );

  /**
   * A ficha toma a coluna enquanto estiver aberta.
   *
   * Uma coluna so, com dois conteudos possiveis: assim o mapa nunca perde
   * largura por causa de um segundo painel, e a ficha nasce no lugar onde a
   * pessoa ja esta acostumada a ler.
   */
  const painelFicha = openMember ? (
    <MemberSheetPanel
      memberId={openMember}
      onClose={() => setOpenMember(null)}
      className="w-full"
    />
  ) : null;

  /**
   * A ficha existe em UM lugar so; o ranking, nos dois (nao custa nada e o
   * CSS esconde o que sobra).
   */
  const colunaDesktop =
    (isDesktop ? painelFicha : null) ?? (comRanking ? painelRanking : null);
  const colunaCelularConteudo =
    (isDesktop ? null : painelFicha) ?? (comRanking ? painelRanking : null);
  /** Em tela cheia ha um painel flutuante so: nao ha copia a evitar. */
  const colunaLateral = painelFicha ?? (comRanking ? painelRanking : null);

  const contagem = candidato ? (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
      <div className="flex gap-1">
        <dt>Votos no filtro:</dt>
        <dd className="font-semibold text-brand-800">{formatNumber(selection.votes + votosForaDoMapa)}</dd>
      </div>
      <div className="flex gap-1">
        <dt>Locais no mapa:</dt>
        <dd className="font-semibold text-ink-900">{formatNumber(selection.placeCount)}</dd>
      </div>
      {foraDoMapa.length > 0 ? (
        <div className="flex gap-1">
          <dt>Locais sem ponto no mapa:</dt>
          <dd className="font-semibold text-ink-900">
            {formatNumber(foraDoMapa.length)} ({formatNumber(votosForaDoMapa)} votos)
          </dd>
        </div>
      ) : null}
    </dl>
  ) : totals ? (
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

  /** No destaque, a contagem vira quatro numeros grandes que correm ate o valor. */
  const contagemDestaque = totals ? (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {(candidato
        ? [
            { rotulo: `Votos de ${candidato.nome}`, valor: selection.votes + votosForaDoMapa, forte: true },
            { rotulo: 'Locais no mapa', valor: selection.placeCount },
            { rotulo: 'Seções com voto', valor: [...selection.places, ...foraDoMapa].reduce((s, p) => s + p.sections.length, 0) },
            { rotulo: 'Locais sem ponto', valor: foraDoMapa.length },
          ]
        : [
            { rotulo: 'Votos no filtro', valor: selection.votes, forte: true },
            { rotulo: 'Pessoas no mapa', valor: selection.pins.length },
            { rotulo: 'Locais de votação', valor: selection.placeCount },
            { rotulo: 'Sem localização', valor: pendentes },
          ]
      ).map((item, i) => (
        <div
          key={item.rotulo}
          className={cn(
            'animate-fade-up rounded-control border px-3 py-2 transition-transform duration-200 hover:-translate-y-0.5',
            item.forte ? 'border-white/20 bg-white/15' : 'border-white/10 bg-white/5',
          )}
          style={{ animationDelay: `${120 + i * 70}ms` }}
        >
          <dt className="truncate text-[0.6875rem] font-medium tracking-wide text-white/70 uppercase">{item.rotulo}</dt>
          <dd className={cn('font-semibold text-white', item.forte ? 'text-2xl' : 'text-xl')}>
            <Contador valor={item.valor} />
          </dd>
        </div>
      ))}
    </dl>
  ) : null;


  /** Botao da votacao e, com um candidato escolhido, a faixa que diz o que o mapa mostra. */
  const barraDaVotacao = (
    <div className="flex flex-wrap items-center gap-2">
      <BotaoDaVotacao
        selecionado={candidato}
        onSelect={escolherCandidato}
        onClear={() => escolherCandidato(null)}
        podeEnviar={podeLocalizar}
      />
      {candidato ? (
        <p className="text-xs text-ink-700" role="status">
          {erroVotacao
            ? 'Não foi possível carregar a votação deste candidato.'
            : votacao === null
              ? 'Carregando a votação…'
              : `${rotuloDoCandidato(candidato)} · ${formatNumber(candidato.total)} votos no estado. O mapa mostra os votos dele por escola, zona e seção.`}
        </p>
      ) : null}
    </div>
  );

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
      {!fullscreen && destaque ? (
        // Destaque: faixa azul-marinho com o titulo grande e os quatro numeros
        // do recorte, que correm ate o valor.
        <div className="relative overflow-hidden rounded-t-card bg-gradient-to-br from-navy-900 via-navy-800 to-brand-800 p-4 text-white sm:p-5">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-accent-500/20 blur-3xl"
          />
          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.14em] text-white/70 uppercase">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-success-400" />
                </span>
                Ao vivo
              </p>
              <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold sm:text-2xl">
                <MapPinIcon aria-hidden="true" className="size-5 text-accent-400" />
                Mapa da mobilização
              </h2>
              <p className="mt-0.5 text-sm text-white/70">
                Onde está cada pessoa e cada voto. Clique num Líder para ver a Equipe dele e baixar os PDFs.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {rankingDisponivel ? (
                <button
                  type="button"
                  aria-pressed={showRanking}
                  onClick={() => setShowRanking((atual) => !atual)}
                  className={cn(
                    'inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-xs font-semibold transition-all duration-200',
                    showRanking
                      ? 'border-white/40 bg-white/20 text-white'
                      : 'border-white/20 bg-transparent text-white/80 hover:bg-white/10',
                  )}
                >
                  <Trophy aria-hidden="true" className="size-3.5" />
                  Ranking
                </button>
              ) : null}
              {podeLocalizar && pendentes > 0 ? (
                <Button variant="secondary" onClick={localizar} disabled={resolving}>
                  {resolving ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />}
                  Localizar pendentes
                </Button>
              ) : null}
            </div>
          </div>
          <div className="relative mt-4">{contagemDestaque}</div>
        </div>
      ) : null}

      {!fullscreen ? (
        <header className="flex shrink-0 flex-col gap-3 border-b border-line p-4">
          {/* No destaque, titulo, ranking e "localizar" ja estao na faixa azul. */}
          <div className={cn('flex flex-wrap items-start justify-between gap-3', destaque && 'hidden')}>
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <MapPinIcon aria-hidden="true" className="size-4 text-brand-700" />
                Mapa da mobilização
              </h2>
              <p className="mt-0.5 text-xs text-ink-500">
                Distribuição dos integrantes por localização cadastrada e local de votação
              </p>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {podeLocalizar && pendentes > 0 && !destaque ? (
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

          {barraDaVotacao}

          <MapFiltersBar query={query} onChange={setQuery} options={options} dense />

          {destaque ? null : contagem}
        </header>
      ) : null}

      <div
        className={cn(
          'flex w-full flex-col lg:flex-row',
          fullscreen
            ? 'absolute inset-0'
            : destaque
              ? 'h-[440px] overflow-hidden sm:h-[540px] lg:h-[660px]'
              : 'h-[360px] overflow-hidden sm:h-[420px] lg:h-[520px]',
        )}
      >
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {loading ? (
            // Esta e a espera longa: o mapa le os integrantes, os vinculos e
            // as coordenadas de todos eles. Uma palavra basta — a lista do
            // que esta sendo lido nao ajuda quem espera.
            <MapaCarregando />
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
                onOpenPlace={candidato ? undefined : setOpenPlace}
                onDownloadPlace={candidato ? undefined : (place) => baixarPdfDaEscola(place, clientId)}
                votacao={modoVotacao}
                onOpenMember={abrirFicha}
                renderLiderActions={renderLiderActions}
                focusPlace={focusPlace}
                fallbackCenter={fallbackCenter}
                resizeKey={`${fullscreen ? 'full' : 'card'}:${
                  painelFicha ? 'ficha' : comRanking ? 'rank' : 'solo'
                }`}
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
                {barraDaVotacao}
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

          {/* Painel lateral flutuante: so em tela cheia. No cartao ele e
              coluna. Mostra a ficha quando ha uma aberta, e o ranking no
              resto do tempo — nunca os dois disputando o mesmo canto. */}
          {fullscreen && pronto && colunaLateral ? (
            <MapPanel
              side="right"
              wide={painelFicha !== null}
              className="top-16 max-h-[calc(100%-5rem)]"
            >
              {colunaLateral}
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

        {/* Coluna lateral: exclusiva do cartao no desktop. Carrega o
            ranking ou, com uma ficha aberta, a ficha — que pede mais
            largura para as duas colunas de dados caberem. */}
        {!fullscreen && pronto && colunaDesktop ? (
          <div
            className={cn(
              'hidden shrink-0 border-l border-line lg:flex lg:h-full',
              painelFicha && isDesktop ? 'lg:w-[26rem]' : 'lg:w-80',
            )}
          >
            {colunaDesktop}
          </div>
        ) : null}
      </div>

      {/* Celular no cartao: a coluna fica FORA da area do mapa, para nao
          roubar altura dele. Rola sozinha e nao estica a pagina sem limite.
          A ficha ganha mais altura que o ranking — ela tem o que ler. */}
      {!fullscreen && pronto && colunaCelularConteudo ? (
        <div
          ref={colunaCelular}
          className={cn(
            'flex border-t border-line lg:hidden',
            painelFicha ? 'max-h-[70vh]' : 'max-h-72',
          )}
        >
          {colunaCelularConteudo}
        </div>
      ) : null}

      {openPlace ? (
        <PlaceMembersPanel
          place={openPlace}
          clientId={clientId}
          onOpenMember={abrirFicha}
          onClose={() => setOpenPlace(null)}
        />
      ) : null}
    </section>
  );
}
