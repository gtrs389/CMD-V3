'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, Check, Globe2, MapPinned, Search, Users, X } from 'lucide-react';
import {
  fotoDoCandidatoUrl,
  municipiosDaVotacao,
  type CandidatoDaVotacao,
  type VotacaoNoMapa,
} from '@/lib/domain/votacao-tse';
import type { PollingPlacePin } from '@/lib/domain/map-pin';
import { FotoDoCandidato } from '@/components/apuracao/FotoDoCandidato';
import { Contador } from '@/components/ui/Contador';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/text';
import { corDoCandidato } from './cores';

/**
 * "Onde voce quer ver?": o passo entre escolher os candidatos e abrir o
 * mapa. Os municipios onde os escolhidos tiveram voto, do mais votado para o
 * menos, cada um com a parte de cada candidato (na cor dele) e quantas
 * pessoas o time tem ali. Um, varios ou o estado inteiro.
 *
 * Os votos chegam pela mesma rota que o mapa usa: e o mapa que mostra o
 * resto, escola, zona e secao.
 */
export function EscolhaDoMunicipio({
  candidatos,
  campanha,
  iniciais = [],
  rotuloDoVoltar = 'Candidatos',
  passo = 'Passo 2 de 2 · o recorte',
  onVoltar,
  onConfirmar,
}: {
  /** Para onde o voltar leva, escrito no botao. */
  rotuloDoVoltar?: string;
  /** A linha de cima do titulo; nulo some. */
  passo?: string | null;
  candidatos: CandidatoDaVotacao[];
  /** As escolas do time (a estimativa): quantas pessoas em cada municipio. */
  campanha?: readonly Pick<PollingPlacePin, 'city' | 'total'>[];
  /** Os municipios ja escolhidos no mapa, para voltar a eles. */
  iniciais?: string[];
  onVoltar: () => void;
  /** Vazio: o estado inteiro. */
  onConfirmar: (municipios: string[]) => void;
}) {
  const loader = useCallback(
    () => Promise.all(candidatos.map((c) => api<VotacaoNoMapa>(`/api/votacao/${encodeURIComponent(c.id)}`))),
    [candidatos],
  );
  const { data: votacoes, error, reload } = useRepositoryQuery(loader);
  const municipios = useMemo(() => (votacoes ? municipiosDaVotacao(votacoes, campanha) : null), [votacoes, campanha]);

  const [busca, setBusca] = useState('');
  const [soDoTime, setSoDoTime] = useState(false);
  const [escolhidos, setEscolhidos] = useState<string[]>(iniciais);
  const alternar = (nome: string) =>
    setEscolhidos((atual) => (atual.includes(nome) ? atual.filter((x) => x !== nome) : [...atual, nome]));

  const temTime = Boolean(municipios?.some((m) => m.pessoasDoTime > 0));
  const termo = busca
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  const visiveis = (municipios ?? []).filter(
    (m) => (!termo || m.chave.includes(termo)) && (!soDoTime || m.pessoasDoTime > 0),
  );
  const maior = Math.max(1, ...(municipios ?? []).map((m) => m.total));
  const totalDoEstado = (municipios ?? []).reduce((t, m) => t + m.total, 0);
  const pessoasDoTime = (municipios ?? []).reduce((t, m) => t + m.pessoasDoTime, 0);

  // Esc volta para a escolha dos candidatos; a busca recebe o foco no computador.
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onVoltar();
      }
    };
    document.addEventListener('keydown', aoTeclar, true);
    // A pagina de tras nao rola enquanto a escolha esta aberta.
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', aoTeclar, true);
      document.body.style.overflow = overflow;
    };
  }, [onVoltar]);
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) campo.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Escolher o município do mapa"
      className="absolute inset-0 z-20 flex animate-fade-in flex-col bg-canvas"
    >
      {/* CABECALHO: quem vai para o mapa e a pergunta. */}
      <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-navy-900 via-navy-800 to-[#1e3a8a] px-4 pt-4 pb-5 text-white sm:px-6">
        <span aria-hidden="true" className="cmd-grade-pontos pointer-events-none absolute inset-0" />
        <span aria-hidden="true" className="cmd-orbe pointer-events-none absolute -top-24 -right-10 size-72 rounded-full bg-gold-500/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start gap-4">
          <BotaoVoltar onClick={onVoltar} rotulo={rotuloDoVoltar} />
          <div className="min-w-0 flex-1">
            <p className="text-[0.625rem] font-bold tracking-[0.16em] text-gold-400 uppercase">{passo ?? 'Votação 2026 · o recorte'}</p>
            <h2 className="mt-1 text-xl leading-tight font-bold sm:text-2xl">Qual município você quer ver?</h2>
            <p className="mt-1 max-w-2xl text-xs text-white/70 sm:text-sm">
              Um, vários ou o estado inteiro. Do mais votado para o menos, com a parte de cada candidato e quanta gente o
              time tem em cada lugar.
            </p>
          </div>
          <ul className="flex -space-x-2 self-center" aria-label="Candidatos escolhidos">
            {candidatos.slice(0, 6).map((c, i) => (
              <li key={c.id} title={c.nome} className="rounded-full ring-2 ring-offset-2 ring-offset-navy-900" style={{ '--tw-ring-color': corDoCandidato(i) } as CSSProperties}>
                <FotoDoCandidato cargo={c.cargoCodigo} sqcand={c.sqcand ?? null} src={fotoDoCandidatoUrl(c)} nome={c.nome} tamanho="sm" />
              </li>
            ))}
            {candidatos.length > 6 ? (
              <li className="flex size-9 items-center justify-center rounded-full bg-gold-400 text-xs font-bold text-navy-900 ring-2 ring-navy-900">
                +{candidatos.length - 6}
              </li>
            ) : null}
          </ul>
        </div>
      </header>

      {/* BUSCA E ATALHOS */}
      <div className="shrink-0 space-y-2.5 border-b border-line bg-canvas/95 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex min-w-0 flex-1 basis-64 items-center">
            <span className="sr-only">Buscar município</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 size-5 text-ink-400" />
            <input
              ref={campo}
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar município"
              className="min-h-12 w-full rounded-pill border border-line bg-surface pr-4 pl-11 text-[0.9375rem] text-ink-900 shadow-card placeholder:text-ink-400 focus:border-accent-600 focus:ring-4 focus:ring-accent-100 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
          </label>
          {temTime ? (
            <button
              type="button"
              aria-pressed={soDoTime}
              onClick={() => setSoDoTime((atual) => !atual)}
              className={cn(
                'inline-flex min-h-12 items-center gap-1.5 rounded-pill border px-4 text-sm font-semibold transition-all',
                soDoTime ? 'border-navy-900 bg-navy-900 text-gold-400 shadow-card' : 'border-line bg-surface text-ink-700 hover:bg-gold-50',
              )}
            >
              <Users aria-hidden="true" className="size-4" />
              Só onde o time tem gente
            </button>
          ) : null}
        </div>
      </div>

      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {error ? (
          <div className="rounded-card border border-danger-200 bg-danger-50 px-4 py-6 text-center text-sm text-danger-700">
            Não foi possível carregar os votos por município.{' '}
            <button type="button" onClick={reload} className="font-semibold underline">
              Tentar de novo
            </button>
          </div>
        ) : municipios === null ? (
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Carregando os municípios">
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className="h-28 animate-shimmer rounded-card border border-line bg-surface" style={{ animationDelay: `${i * 70}ms` }} />
            ))}
            <p className="col-span-full flex items-center justify-center gap-2 pt-1 text-xs text-ink-500">
              <Spinner className="size-3.5" /> Somando os votos município a município…
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* O estado inteiro: o atalho de sempre, em destaque. */}
            <button
              type="button"
              onClick={() => onConfirmar([])}
              className="group relative flex w-full items-center gap-4 overflow-hidden rounded-card border-2 border-dashed border-accent-600/50 bg-gradient-to-r from-accent-50 via-surface to-gold-50 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent-600 hover:shadow-raised"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-navy-900 text-gold-400">
                <Globe2 aria-hidden="true" className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold text-ink-900">O estado inteiro</span>
                <span className="block text-xs text-ink-500">
                  {formatNumber(municipios.length)} municípios · {formatNumber(totalDoEstado)} votos
                  {pessoasDoTime ? ` · ${formatNumber(pessoasDoTime)} pessoas do time` : ''}
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-navy-900 px-3.5 py-2 text-xs font-bold text-gold-400 transition-transform group-hover:translate-x-0.5">
                <MapPinned aria-hidden="true" className="size-4" />
                Ver tudo
              </span>
            </button>

            <p className="text-xs text-ink-500">
              {visiveis.length === 0
                ? 'Nenhum município com essa busca.'
                : `${formatNumber(visiveis.length)} ${visiveis.length === 1 ? 'município' : 'municípios'} · toque para escolher, quantos quiser`}
            </p>

            <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {visiveis.map((m, i) => {
                const ligado = escolhidos.includes(m.nome);
                const posicao = municipios.indexOf(m) + 1;
                return (
                  <li key={m.chave} className="cmd-cascata" style={{ '--cmd-atraso': `${Math.min(i, 12) * 30}ms` } as CSSProperties}>
                    <button
                      type="button"
                      onClick={() => alternar(m.nome)}
                      aria-pressed={ligado}
                      className={cn(
                        'group relative flex h-full w-full flex-col gap-2 overflow-hidden rounded-card border bg-surface p-3.5 text-left transition-all duration-200',
                        ligado
                          ? 'border-transparent shadow-raised ring-2 ring-navy-900'
                          : 'border-line hover:-translate-y-0.5 hover:border-accent-100 hover:shadow-raised',
                      )}
                    >
                      <span className="flex items-start gap-2.5">
                        <span
                          className={cn(
                            'flex size-7 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-bold tabular-nums',
                            posicao <= 3 && m.total > 0 ? 'bg-gold-400 text-navy-900' : 'bg-ink-100 text-ink-700',
                          )}
                        >
                          {posicao}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm leading-snug font-bold wrap-break-word text-ink-900">{m.nome}</span>
                          <span className="block text-[0.6875rem] text-ink-500">
                            {m.locais ? `${formatNumber(m.locais)} ${m.locais === 1 ? 'local' : 'locais'} com voto` : 'nenhum voto ainda'}
                          </span>
                        </span>
                        <span
                          aria-hidden="true"
                          className={cn(
                            'flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300',
                            ligado ? 'scale-110 border-navy-900 bg-navy-900 text-gold-400' : 'border-ink-200 text-transparent group-hover:border-accent-400',
                          )}
                        >
                          <Check className="size-3.5" strokeWidth={3} />
                        </span>
                      </span>

                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-xl leading-none font-bold text-ink-900 tabular-nums">
                          <Contador valor={m.total} />
                          <span className="ml-1 text-[0.6875rem] font-normal text-ink-500">votos</span>
                        </span>
                        {m.pessoasDoTime ? (
                          <span className="inline-flex items-center gap-1 rounded-pill bg-gold-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-gold-700 ring-1 ring-gold-500/40 ring-inset">
                            <Users aria-hidden="true" className="size-3" />
                            {formatNumber(m.pessoasDoTime)} do time
                          </span>
                        ) : null}
                      </span>

                      {/* A parte de cada candidato, na cor dele, na escala do mais votado. */}
                      <span className="block h-2 overflow-hidden rounded-pill bg-ink-100" aria-hidden="true">
                        <span className="flex h-full" style={{ width: `${(m.total / maior) * 100}%` }}>
                          {m.votos.map((v, k) =>
                            v > 0 ? <span key={k} className="h-full" style={{ flex: `${v} 0 0`, background: corDoCandidato(k) }} /> : null,
                          )}
                        </span>
                      </span>
                      {candidatos.length > 1 ? (
                        <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.6875rem] text-ink-500">
                          {candidatos.map((c, k) => (
                            <span key={c.id} className="inline-flex items-center gap-1">
                              <span className="size-1.5 rounded-full" style={{ background: corDoCandidato(k) }} />
                              <b className="font-semibold text-ink-700 tabular-nums">{formatNumber(m.votos[k] ?? 0)}</b>
                              {c.nome.split(' ')[0]}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* RODAPE: os escolhidos e o botao. */}
      <footer className="safe-bottom flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-4 py-3 sm:px-6">
        {escolhidos.length > 0 ? (
          <ul className="scrollbar-slim flex max-h-20 min-w-0 flex-1 flex-wrap gap-1.5 overflow-y-auto" aria-label="Municípios escolhidos">
            {escolhidos.map((nome) => (
              <li key={nome} className="cmd-chip-entra">
                <button
                  type="button"
                  onClick={() => alternar(nome)}
                  title={`Tirar ${nome}`}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-pill border border-navy-900/15 bg-accent-50 px-2.5 text-xs font-semibold text-navy-900 hover:border-navy-900"
                >
                  {nome}
                  <X aria-hidden="true" className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="min-w-0 flex-1 text-xs text-ink-500">Escolha um ou mais municípios — ou veja o estado inteiro.</p>
        )}
        <button
          type="button"
          onClick={() => onConfirmar(escolhidos)}
          disabled={escolhidos.length === 0}
          className="group relative inline-flex min-h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-pill bg-gradient-to-r from-gold-400 to-gold-500 px-6 text-[0.9375rem] font-bold text-navy-900 shadow-[0_12px_28px_-10px_rgba(242,193,78,0.9)] transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 sm:w-auto"
        >
          {escolhidos.length > 0 ? <span aria-hidden="true" className="cmd-cta__brilho" /> : null}
          <MapPinned aria-hidden="true" className="relative size-5" />
          <span className="relative">
            {escolhidos.length === 0
              ? 'Ver no mapa'
              : escolhidos.length === 1
                ? `Ver ${escolhidos[0]} no mapa`
                : `Ver ${escolhidos.length} municípios no mapa`}
          </span>
        </button>
      </footer>
    </div>
  );
}

/**
 * O voltar da Votacao: seta num circulo de vidro, com o destino escrito ao
 * lado ("Voltar · Mapa") e o atalho do teclado. Some o texto no celular.
 */
export function BotaoVoltar({ onClick, rotulo, disabled }: { onClick: () => void; rotulo: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Voltar: ${rotulo}`}
      className="group inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-pill border border-white/15 bg-white/10 py-1 pr-1 pl-1 text-left text-white backdrop-blur transition-all duration-200 hover:border-white/30 hover:bg-white/15 focus-visible:ring-4 focus-visible:ring-gold-400/40 focus-visible:outline-none disabled:opacity-50 sm:pr-3.5"
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-white text-navy-900 shadow-card transition-transform duration-200 group-hover:-translate-x-0.5">
        <ArrowLeft aria-hidden="true" className="size-4.5" strokeWidth={2.5} />
      </span>
      <span className="hidden leading-tight sm:block">
        <span className="block text-[0.625rem] font-semibold tracking-[0.14em] text-white/60 uppercase">Voltar</span>
        <span className="block text-sm font-bold">{rotulo}</span>
      </span>
      <kbd className="ml-1 hidden rounded border border-white/20 bg-white/5 px-1.5 py-0.5 font-sans text-[0.625rem] font-semibold text-white/60 lg:inline">
        Esc
      </kbd>
    </button>
  );
}
