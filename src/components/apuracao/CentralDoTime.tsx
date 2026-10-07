'use client';

import { useEffect, useMemo, useState, type CSSProperties, type RefObject } from 'react';
import { Check, ChevronDown, ChevronRight, ChevronUp, MapPinned, Search, Trophy, Users, Vote, X } from 'lucide-react';
import { fotoDoCandidatoUrl, type CandidatoDaVotacao } from '@/lib/domain/votacao-tse';
import type { ClientSummary } from '@/lib/types';
import { useClient, useClientSummaries } from '@/hooks/use-clients';
import { cn } from '@/lib/utils/cn';
import { formatNumber, initials, matchesSearch } from '@/lib/utils/text';
import { MobilizationMap, type PedidoDeVotacao } from '@/components/dashboard/MobilizationMap';
import { corDoCandidato } from '@/components/dashboard/votacao/cores';
import { Spinner } from '@/components/ui/Spinner';
import { CarregandoVotacao } from '@/components/dashboard/votacao/CarregandoVotacao';
import { FotoDoCandidato } from './FotoDoCandidato';

/**
 * O time no mapa, dentro da Sala de Apuracao.
 *
 * Tres passos, na ordem em que a noite acontece:
 *   1. escolher o time (o ADMIN escolhe qualquer um; o Administrador do time
 *      ja entra no seu);
 *   2. o mapa do time abre com "Onde voce tem mais votos" — a estimativa da
 *      campanha, escola por escola;
 *   3. escolher um ou mais candidatos no resultado do TSE e mandar para o
 *      mapa: os votos de cada um, secao por secao, contra a estimativa.
 */

export interface TimeDaSala {
  id: string;
  nome: string;
  foto: string | null;
  integrantes: number | null;
  isDemo: boolean;
}

/** Um candidato marcado na Sala para ir ao mapa. */
export interface CandidatoMarcado {
  chave: string;
  cargo: number;
  numero: string;
  nome: string;
  nomeDoCargo: string;
  sqcand: string | null;
  /** Ano da eleicao: sem o sequencial, a foto e achada pelo numero de urna e o ano. */
  ano: number;
}

export function chaveDoMarcado(cargo: number, numero: string): string {
  return `${cargo}:${numero}`;
}

interface CentralDoTimeProps {
  /** ADMIN escolhe o time; os outros perfis ficam presos ao proprio. */
  podeEscolher: boolean;
  /** Time da sessao (Administrador do time). */
  timeDaSessao: string | null;
  time: TimeDaSala | null;
  onTime: (time: TimeDaSala | null) => void;
  pedido: PedidoDeVotacao | null;
  onCandidatosDoMapa: (candidatos: CandidatoDaVotacao[]) => void;
  marcados: CandidatoMarcado[];
  fallbackCenter?: { latitude: number; longitude: number };
  mapaRef: RefObject<HTMLDivElement | null>;
  /**
   * Candidatos a caminho do mapa: a espera animada cobre o mapa desde o
   * clique em "Ver no mapa", antes mesmo da votacao chegar.
   */
  preparando?: CandidatoDaVotacao[] | null;
}

export function CentralDoTime({
  podeEscolher,
  timeDaSessao,
  time,
  onTime,
  pedido,
  onCandidatosDoMapa,
  marcados,
  fallbackCenter,
  mapaRef,
  preparando = null,
}: CentralDoTimeProps) {
  const passo = !time ? 1 : marcados.length === 0 && !pedido?.candidatos.length ? 2 : 3;

  return (
    <section
      id="mapa-do-time"
      aria-label="Seu time no mapa"
      className="scroll-mt-4 overflow-hidden rounded-card border border-line bg-surface shadow-card"
    >
      <div className="relative overflow-hidden border-b border-line bg-gradient-to-r from-accent-50 via-surface to-gold-50 px-4 py-4 sm:px-5">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-accent-100/70 blur-3xl"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.16em] text-accent-700 uppercase">
              <MapPinned aria-hidden="true" className="size-3.5" />
              Seu time no mapa
            </p>
            <h2 className="mt-1 text-lg font-bold tracking-tight text-ink-900 sm:text-xl">
              Onde está cada voto do seu time
            </h2>
            <p className="mt-0.5 max-w-2xl text-sm text-ink-500">
              Escolha o time, veja onde ele tem mais votos e mande os candidatos da apuração para o mapa — escola,
              zona e seção.
            </p>
          </div>
        </div>

        <ol className="relative mt-4 grid gap-2 sm:grid-cols-3" aria-label="Passos">
          {[
            { n: 1, texto: 'Escolha o time', icone: <Users className="size-4" /> },
            { n: 2, texto: 'Onde você tem mais votos', icone: <Trophy className="size-4" /> },
            { n: 3, texto: 'Candidatos no mapa', icone: <Vote className="size-4" /> },
          ].map((p) => {
            const feito = passo > p.n;
            const ativo = passo === p.n;
            return (
              <li
                key={p.n}
                aria-current={ativo ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-control border px-3 py-2 text-sm transition-all duration-300',
                  ativo
                    ? 'cmd-passo-ativo border-accent-600 bg-surface font-semibold text-ink-900'
                    : feito
                      ? 'border-success-600/30 bg-success-50 text-success-700'
                      : 'border-line bg-surface/70 text-ink-500',
                )}
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-300',
                    ativo ? 'bg-accent-600 text-white' : feito ? 'bg-success-600 text-white' : 'bg-ink-100 text-ink-500',
                  )}
                >
                  {feito ? <Check aria-hidden="true" className="size-4" strokeWidth={3} /> : p.icone}
                </span>
                <span className="min-w-0 wrap-break-word">
                  <span className="sr-only">Passo {p.n}: </span>
                  {p.texto}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {podeEscolher ? (
          <SeletorDeTime escolhido={time} onEscolher={onTime} />
        ) : timeDaSessao ? (
          <TimeDaSessao id={timeDaSessao} time={time} onTime={onTime} />
        ) : (
          <p className="rounded-control border border-line bg-ink-50 px-3 py-4 text-center text-sm text-ink-500">
            Nenhum time vinculado a esta conta.
          </p>
        )}

        {time ? (
          <div ref={mapaRef} className="scroll-mt-4 animate-fade-in">
            {marcados.length > 0 && !pedido?.candidatos.length ? (
              <p className="mb-3 flex flex-wrap items-center gap-2 rounded-control border border-accent-100 bg-accent-50 px-3 py-2 text-xs text-accent-700">
                <Vote aria-hidden="true" className="size-4" />
                {marcados.length === 1 ? '1 candidato marcado' : `${marcados.length} candidatos marcados`}. Toque em{' '}
                <b>Ver no mapa</b> na barra de baixo para ver os votos de cada um contra a estimativa do time.
              </p>
            ) : null}
            {/* Um mapa por time: trocar de time recomeca o recorte. */}
            <div className="relative">
              {preparando?.length ? (
                <div className="absolute inset-0 z-[46] overflow-hidden rounded-card">
                  <CarregandoVotacao
                    candidatos={preparando}
                    cores={preparando.map((_, i) => (preparando.length > 1 ? corDoCandidato(i) : '#e0a426'))}
                  />
                </div>
              ) : null}
              <MobilizationMap
                key={time.id}
                clientId={time.id}
                clientName={time.nome}
                destaque
                naSala
                pedidoDeVotacao={pedido}
                onCandidatosChange={onCandidatosDoMapa}
                fallbackCenter={fallbackCenter}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-line px-6 py-10 text-center">
            <span className="relative flex size-14 items-center justify-center rounded-full bg-accent-50 text-accent-600">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent-100 opacity-60" />
              <MapPinned aria-hidden="true" className="relative size-7" />
            </span>
            <p className="text-base font-semibold text-ink-900">Escolha um time para abrir o mapa</p>
            <p className="max-w-md text-sm text-ink-500">
              O mapa mostra onde o time tem mais votos. Depois é só tocar em <b>Votação 2026</b> e escolher os
              candidatos para ver onde cada um teve voto.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------
   Passo 1: o time
   ------------------------------------------------------------------------- */

function comoTime(c: ClientSummary): TimeDaSala {
  return { id: c.id, nome: c.name, foto: c.photo, integrantes: c.memberCount, isDemo: c.isDemo };
}

function SeletorDeTime({
  escolhido,
  onEscolher,
}: {
  escolhido: TimeDaSala | null;
  onEscolher: (time: TimeDaSala | null) => void;
}) {
  const { data, loading, error } = useClientSummaries({ includeDemo: true });
  const [busca, setBusca] = useState('');
  const times = useMemo(
    () =>
      [...(data ?? [])]
        // Operacao real primeiro, do maior time ao menor.
        .sort((a, b) => Number(a.isDemo || a.isCopy) - Number(b.isDemo || b.isCopy) || b.memberCount - a.memberCount)
        .filter((c) => matchesSearch(busca, c.name)),
    [data, busca],
  );

  if (error) {
    return (
      <p className="rounded-control border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
        Não foi possível carregar os times. {error}
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <span className="flex size-6 items-center justify-center rounded-full bg-accent-600 text-xs font-bold text-white">
            1
          </span>
          {escolhido ? 'Time escolhido' : 'Escolha o time'}
        </h3>
        <div className="relative w-full sm:w-64">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar time"
            aria-label="Buscar time"
            className="min-h-10 w-full rounded-pill border border-line bg-ink-50 pr-3 pl-9 text-sm text-ink-900 placeholder:text-ink-400 focus:border-accent-600 focus:bg-surface focus:outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-ink-500">
          <Spinner className="size-4" /> Carregando os times…
        </div>
      ) : times.length === 0 ? (
        <p className="py-4 text-sm text-ink-500">{busca ? 'Nenhum time com esse nome.' : 'Nenhum time cadastrado.'}</p>
      ) : (
        // Grade, e nao fila com rolagem lateral: todo time aparece, com o nome
        // inteiro, e os cartoes de cada linha ficam da mesma altura.
        <ul className="grid gap-2.5 pt-1 sm:grid-cols-2 xl:grid-cols-3" aria-label="Times">
          {times.map((c, i) => {
            const ligado = escolhido?.id === c.id;
            return (
              <li key={c.id} className="cmd-cascata flex" style={{ '--cmd-atraso': `${Math.min(i, 10) * 40}ms` } as CSSProperties}>
                <button
                  type="button"
                  aria-pressed={ligado}
                  onClick={() => onEscolher(ligado ? null : comoTime(c))}
                  className={cn(
                    'group relative flex h-full w-full items-center gap-3 overflow-hidden rounded-card border p-3 text-left transition-all duration-300',
                    ligado
                      ? 'border-accent-600 bg-gradient-to-br from-accent-600 to-[#1e3a8a] text-white shadow-[0_14px_30px_-14px_rgba(37,99,235,0.9)]'
                      : 'border-line bg-surface hover:-translate-y-0.5 hover:border-accent-100 hover:shadow-raised',
                  )}
                >
                  {c.photo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={c.photo}
                      alt=""
                      className={cn('size-11 shrink-0 rounded-full object-cover', ligado ? 'ring-2 ring-white/70' : 'ring-1 ring-line')}
                    />
                  ) : (
                    <span
                      className={cn(
                        'flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                        ligado ? 'bg-white/15 text-white' : 'bg-gradient-to-br from-navy-800 to-navy-600 text-white',
                      )}
                    >
                      {initials(c.name)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block wrap-break-word text-sm font-semibold">{c.name}</span>
                    <span className={cn('block text-xs', ligado ? 'text-white/75' : 'text-ink-500')}>
                      {formatNumber(c.memberCount)} integrantes
                      {c.isDemo ? ' · DEMO' : c.isCopy ? ' · duplicado' : ''}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300',
                      ligado ? 'scale-100 border-white bg-white text-accent-700' : 'border-ink-200 text-transparent group-hover:border-accent-400',
                    )}
                  >
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Administrador do time: o time ja vem da sessao. */
function TimeDaSessao({
  id,
  time,
  onTime,
}: {
  id: string;
  time: TimeDaSala | null;
  onTime: (time: TimeDaSala | null) => void;
}) {
  const { data } = useClient(id);
  const nome = data?.name ?? time?.nome ?? 'Seu time';
  const foto = data?.photo ?? null;
  const isDemo = data?.isDemo ?? false;
  // O time vale desde o primeiro quadro; o nome e a foto chegam depois.
  useEffect(() => {
    onTime({ id, nome, foto, integrantes: null, isDemo });
  }, [id, nome, foto, isDemo, onTime]);
  return (
    <div className="flex items-center gap-3 rounded-card border border-accent-100 bg-accent-50 p-3">
      <span className="flex size-10 items-center justify-center rounded-full bg-accent-600 text-sm font-bold text-white">
        {initials(nome)}
      </span>
      <div className="min-w-0">
        <p className="text-[0.6875rem] font-semibold tracking-wide text-accent-700 uppercase">Seu time</p>
        <p className="wrap-break-word text-sm font-semibold text-ink-900">{nome}</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Passo 3: a bandeja dos candidatos marcados
   ------------------------------------------------------------------------- */

export function BandejaDoMapa({
  marcados,
  time,
  enviando,
  aviso,
  jaNoMapa,
  onTirar,
  onVerNoMapa,
}: {
  marcados: CandidatoMarcado[];
  time: TimeDaSala | null;
  enviando: boolean;
  aviso: string | null;
  /** Os marcados ja sao exatamente os do mapa: o botao so leva ate ele. */
  jaNoMapa: boolean;
  onTirar: (chave: string) => void;
  onVerNoMapa: () => void;
}) {
  /**
   * "Ocultar" recolhe a bandeja numa pilula com os rostos: a escolha continua
   * de pe (e no mapa), so sai da frente da apuracao. Tocar a pilula a abre.
   */
  const [oculta, setOculta] = useState(false);
  if (marcados.length === 0) return null;

  const foto = (c: CandidatoMarcado) =>
    fotoDoCandidatoUrl({ cargoCodigo: c.cargo, numero: c.numero, ano: c.ano, sqcand: c.sqcand });
  const verNoMapa = (
    <button
      type="button"
      onClick={onVerNoMapa}
      disabled={enviando}
      className="group inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-pill bg-gradient-to-r from-gold-400 to-gold-500 px-4 text-sm font-bold text-navy-900 shadow-[0_8px_20px_-8px_rgba(242,193,78,0.8)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-8px_rgba(242,193,78,0.9)] disabled:opacity-60 sm:flex-none"
    >
      {enviando ? (
        <Spinner className="size-4" />
      ) : jaNoMapa ? (
        <Check aria-hidden="true" className="size-4" strokeWidth={3} />
      ) : (
        <MapPinned aria-hidden="true" className="size-4" />
      )}
      {!time ? 'Escolha um time' : jaNoMapa ? 'No mapa · ir até ele' : `Ver no mapa (${marcados.length})`}
      <ChevronRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
    </button>
  );

  if (oculta) {
    return (
      <div className="pointer-events-none fixed right-3 bottom-3 z-40 flex justify-end">
        <button
          type="button"
          onClick={() => setOculta(false)}
          aria-label={`Mostrar os ${marcados.length} candidatos marcados`}
          title="Mostrar os candidatos marcados"
          className="cmd-bandeja group pointer-events-auto flex items-center gap-2.5 rounded-pill border border-white/10 bg-navy-900/95 py-1.5 pr-3 pl-1.5 text-white shadow-[0_18px_40px_-12px_rgba(15,30,53,0.7)] backdrop-blur-md transition-transform hover:-translate-y-0.5"
        >
          <span className="flex -space-x-2">
            {marcados.slice(0, 5).map((c, i) => (
              <span
                key={c.chave}
                className="rounded-full ring-2 ring-offset-2 ring-offset-navy-900"
                style={{ '--tw-ring-color': corDoCandidato(i) } as CSSProperties}
              >
                <FotoDoCandidato cargo={c.cargo} sqcand={c.sqcand} src={foto(c)} nome={c.nome} tamanho="xs" />
              </span>
            ))}
            {marcados.length > 5 ? (
              <span className="flex size-7 items-center justify-center rounded-full bg-gold-400 text-[0.625rem] font-bold text-navy-900 ring-2 ring-navy-900">
                +{marcados.length - 5}
              </span>
            ) : null}
          </span>
          <span className="text-xs font-semibold tabular-nums">
            {marcados.length} {marcados.length === 1 ? 'candidato' : 'candidatos'}
          </span>
          <ChevronUp aria-hidden="true" className="size-4 text-gold-400 transition-transform group-hover:-translate-y-0.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 lg:pl-[15rem]">
      <div
        role="region"
        aria-label="Candidatos marcados para o mapa"
        // Os nomes inteiros numa linha (quebrando quando precisa) e as acoes
        // na de baixo: nome comprido nunca empurra nem esconde o botao.
        className="cmd-bandeja pointer-events-auto flex w-full max-w-3xl flex-col gap-2 rounded-card border border-white/10 bg-navy-900/95 p-2.5 text-white shadow-[0_24px_50px_-12px_rgba(15,30,53,0.7)] backdrop-blur-md"
      >
        {/* Muitos marcados: a fileira rola por dentro, o botao fica sempre a vista. */}
        <div className="scrollbar-slim flex max-h-32 min-w-0 items-center gap-2 overflow-y-auto">
          <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5" aria-label="Marcados">
            {marcados.map((c, i) => (
              <li key={c.chave} className="cmd-chip-entra max-w-full">
                <button
                  type="button"
                  onClick={() => onTirar(c.chave)}
                  title={`Tirar ${c.nome}`}
                  className="inline-flex min-h-10 items-center gap-2 rounded-pill border border-white/15 bg-white/10 py-0.5 pr-2.5 pl-0.5 text-left text-xs font-semibold transition-colors hover:bg-white/20"
                >
                  {/* A foto oficial, com o anel na cor que o candidato tem no mapa. */}
                  <span
                    className="rounded-full ring-2 ring-offset-1 ring-offset-navy-900"
                    style={{ '--tw-ring-color': corDoCandidato(i) } as CSSProperties}
                  >
                    <FotoDoCandidato cargo={c.cargo} sqcand={c.sqcand} src={foto(c)} nome={c.nome} tamanho="xs" />
                  </span>
                  <span className="min-w-0">
                    <span className="block wrap-break-word leading-tight">{c.nome}</span>
                    <span className="block text-[0.625rem] leading-tight font-medium text-white/55">
                      {c.numero} · {c.nomeDoCargo}
                    </span>
                  </span>
                  <X aria-hidden="true" className="size-3 shrink-0 text-white/60" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-2 border-t border-white/10 pt-2">
          <span className="pl-1 text-[0.6875rem] font-semibold tracking-wide text-navy-300 uppercase tabular-nums">
            {marcados.length} {marcados.length === 1 ? 'marcado' : 'marcados'}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setOculta(true)}
            className="inline-flex min-h-10 items-center gap-1 rounded-pill px-3 text-xs font-semibold text-navy-200 hover:bg-white/10 hover:text-white"
          >
            <ChevronDown aria-hidden="true" className="size-4" />
            Ocultar
          </button>
          {verNoMapa}
        </div>
        {aviso ? <p className="text-xs text-gold-400 sm:hidden">{aviso}</p> : null}
      </div>
      {aviso ? (
        <p
          role="status"
          className="pointer-events-auto absolute bottom-full mb-2 hidden max-w-md rounded-control bg-navy-900 px-3 py-1.5 text-xs text-gold-400 shadow-overlay sm:block"
        >
          {aviso}
        </p>
      ) : null}
    </div>
  );
}
