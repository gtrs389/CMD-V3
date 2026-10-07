'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  ChartBar,
  Check,
  Crown,
  MapPinned,
  Plus,
  Search,
  Star,
  Trophy,
  Upload,
  Vote,
  X,
} from 'lucide-react';
import {
  cargosDaVotacao,
  chaveDoFavorito,
  filtrarCandidatos,
  fotoDoCandidatoUrl,
  type CandidatoDaVotacao,
} from '@/lib/domain/votacao-tse';
import { FotoDoCandidato } from '@/components/apuracao/FotoDoCandidato';
import { Contador } from '@/components/ui/Contador';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/text';
import { corDoCandidato } from './cores';
import { importarVotacao, type Andamento, type ResumoDoEnvio } from './importar-votacao';
import { textoDoAndamento, useVotacaoAoVivo } from './use-votacao-ao-vivo';
import { BotaoVoltar, EscolhaDoMunicipio } from './EscolhaDoMunicipio';
import type { PollingPlacePin } from '@/lib/domain/map-pin';

/**
 * Central de candidatos: a escolha de quem vai para o mapa.
 *
 * Em vez de uma lista seca, a votacao inteira de relance: o anel das secoes
 * apuradas, os cargos em botoes com a contagem, o podio do cargo escolhido e,
 * em cada candidato, a barra dos votos (contra o lider do cargo), a parte dos
 * votos validos e a posicao. Do lado, "Sua selecao": quantos candidatos
 * quiser, cada um na cor que tera no mapa, e um grafico comparando todos.
 * Abre na tela inteira: a lista e a selecao pedem espaco.
 *
 * A lista chega inteira de uma vez (alguns milhares de nomes, sem as secoes)
 * e e filtrada aqui: digitar nao espera o servidor. O ADMIN geral envia a
 * planilha do TSE no fim da lista.
 */

/** Quantos nomes a lista mostra de cada vez; "Mostrar mais" traz outra leva. */
const LEVA = 40;

interface Estatistica {
  /** Votos validos do cargo no turno (candidatos e legenda). */
  validos: number;
  /** O mais votado do cargo: a barra de cada um e relativa a ele. */
  maior: number;
  /** Posicao de cada candidato no cargo, pelo id. */
  posicao: Map<string, number>;
}

const chaveDoCargo = (c: Pick<CandidatoDaVotacao, 'turno' | 'cargoCodigo'>) => `${c.turno}:${c.cargoCodigo}`;
const pct = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export function CentralDeCandidatos({
  podeEnviar,
  selecionados,
  campanha,
  municipiosIniciais,
  onClose,
  onConfirm,
}: {
  podeEnviar: boolean;
  selecionados: CandidatoDaVotacao[];
  /** As escolas do time: quantas pessoas em cada municipio, no passo do municipio. */
  campanha?: readonly Pick<PollingPlacePin, 'city' | 'total'>[];
  /** Os municipios que o mapa ja mostra. */
  municipiosIniciais?: string[];
  onClose: () => void;
  /**
   * `municipios`: os escolhidos no passo 2 (vazio: o estado inteiro). Nulo
   * quando nao houve passo 2 (voltar ao mapa da campanha).
   */
  onConfirm: (candidatos: CandidatoDaVotacao[], municipios: string[] | null) => void;
}) {
  /** Passo 1: os candidatos. Passo 2: o municipio, antes de abrir o mapa. */
  const [passo, setPasso] = useState<'candidatos' | 'municipio'>('candidatos');
  /** A escolha em andamento: so vai para o mapa no "Ver no mapa". */
  const [escolhidos, setEscolhidos] = useState<CandidatoDaVotacao[]>(selecionados);
  const [aviso, setAviso] = useState<string | null>(null);
  /** Sem limite: cada toque poe ou tira, e cada um ganha a proxima cor. */
  function alternar(c: CandidatoDaVotacao) {
    setAviso(null);
    setEscolhidos((atual) => (atual.some((x) => x.id === c.id) ? atual.filter((x) => x.id !== c.id) : [...atual, c]));
  }

  const loader = useCallback(() => api<{ candidatos: CandidatoDaVotacao[]; favoritos?: string[] }>('/api/votacao'), []);
  const { data, error, reload } = useRepositoryQuery(loader);
  const lista = data?.candidatos ?? null;
  // Com a central aberta, a apuracao anda: boletim novo recarrega a lista.
  const { situacao, coletando, erro: erroAoVivo } = useVotacaoAoVivo(true, reload);
  const andamento = textoDoAndamento(situacao);

  const [turno, setTurno] = useState<number | null>(null);
  const [cargo, setCargo] = useState<number | null>(null);
  const [busca, setBusca] = useState('');
  const [todos, setTodos] = useState(false);
  const [soFavoritos, setSoFavoritos] = useState(false);
  const [enviando, setEnviando] = useState(false);

  /** Favoritos (migration 057): a marcacao aparece na hora; a resposta confirma. */
  const [marcados, setMarcados] = useState<string[] | null>(null);
  const favoritos = useMemo(() => new Set(marcados ?? data?.favoritos ?? []), [marcados, data]);
  function alternarFavorito(c: CandidatoDaVotacao) {
    const chave = chaveDoFavorito(c);
    const antes = [...favoritos];
    const favorito = !favoritos.has(chave);
    setMarcados(favorito ? [...antes, chave] : antes.filter((k) => k !== chave));
    api<{ favoritos: string[] }>('/api/votacao/favoritos', {
      method: 'POST',
      body: { ano: c.ano, uf: c.uf, cargoCodigo: c.cargoCodigo, numero: c.numero, favorito },
    })
      .then((r) => setMarcados(r.favoritos))
      .catch((e: unknown) => {
        setMarcados(antes);
        setAviso(e instanceof Error ? e.message : 'Não foi possível salvar o favorito.');
      });
  }

  const turnos = useMemo(() => [...new Set((lista ?? []).map((c) => c.turno))].sort(), [lista]);
  // Comeca no 1o turno: sem isso, o mesmo nome apareceria duas vezes.
  const turnoAtivo = turno ?? turnos[0] ?? null;
  const cargos = useMemo(() => cargosDaVotacao(lista ?? []), [lista]);
  const contagemPorCargo = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of lista ?? []) {
      if (c.tipo !== 'CANDIDATO' || (turnoAtivo !== null && c.turno !== turnoAtivo)) continue;
      m.set(c.cargoCodigo, (m.get(c.cargoCodigo) ?? 0) + 1);
    }
    return m;
  }, [lista, turnoAtivo]);

  const achados = useMemo(
    () => filtrarCandidatos(lista ?? [], { turno: turnoAtivo, cargoCodigo: cargo, busca, todos, favoritos, soFavoritos }),
    [lista, turnoAtivo, cargo, busca, todos, favoritos, soFavoritos],
  );

  /** Votos validos, o lider e a posicao de cada um, cargo a cargo. */
  const estatisticas = useMemo(() => {
    const grupos = new Map<string, CandidatoDaVotacao[]>();
    for (const c of lista ?? []) {
      const k = chaveDoCargo(c);
      grupos.set(k, [...(grupos.get(k) ?? []), c]);
    }
    const m = new Map<string, Estatistica>();
    for (const [k, grupo] of grupos) {
      const candidatos = grupo.filter((c) => c.tipo === 'CANDIDATO').sort((a, b) => b.total - a.total);
      m.set(k, {
        validos: grupo.filter((c) => c.tipo === 'CANDIDATO' || c.tipo === 'LEGENDA').reduce((s, c) => s + c.total, 0),
        maior: candidatos[0]?.total ?? 0,
        posicao: new Map(candidatos.map((c, i) => [c.id, i + 1])),
      });
    }
    return m;
  }, [lista]);

  /** O podio: os tres mais votados do cargo escolhido. */
  const podio = useMemo(() => {
    if (cargo === null || busca || soFavoritos) return [];
    return (lista ?? [])
      .filter((c) => c.tipo === 'CANDIDATO' && c.cargoCodigo === cargo && (turnoAtivo === null || c.turno === turnoAtivo))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
  }, [lista, cargo, turnoAtivo, busca, soFavoritos]);

  /** "Mostrar mais": a leva volta ao comeco quando o filtro muda. */
  const chaveDoFiltro = `${turnoAtivo}|${cargo}|${busca}|${todos}|${soFavoritos}`;
  const [leva, setLeva] = useState({ chave: '', quantos: LEVA });
  const quantos = leva.chave === chaveDoFiltro ? leva.quantos : LEVA;

  // Esc fecha; o fundo nao rola; a busca recebe o foco no computador.
  const busy = enviando;
  const campoDeBusca = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const aoTeclar = (e: KeyboardEvent) => {
      // No passo do municipio, o Esc e dele: volta para os candidatos.
      if (e.key === 'Escape' && !busy && passo === 'candidatos') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', aoTeclar, true);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', aoTeclar, true);
    };
  }, [busy, onClose, passo]);
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) campoDeBusca.current?.focus({ preventScroll: true });
  }, []);

  const podeConfirmar = escolhidos.length > 0 || selecionados.length > 0;
  /** "Ver no mapa": com candidatos, antes pergunta o municipio. */
  const confirmar = () => {
    if (!podeConfirmar) return;
    if (escolhidos.length === 0) onConfirm([], null);
    else setPasso('municipio');
  };
  const voltarDoMunicipio = useCallback(() => setPasso('candidatos'), []);

  const secoesPct = situacao?.totalDeSecoes ? Math.min(100, (situacao.secoesApuradas / situacao.totalDeSecoes) * 100) : 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <div aria-hidden="true" className="absolute inset-0 animate-fade-in bg-navy-900/60 backdrop-blur-sm" />

      {/* Tela inteira, de borda a borda: a lista e a selecao pedem espaco. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Votação 2026: escolher candidatos para o mapa"
        className="relative flex h-dvh w-full animate-scale-in flex-col overflow-hidden bg-canvas"
      >
        {/* CABECALHO: o que e, ao vivo, e o anel das secoes. */}
        <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-navy-900 via-navy-800 to-[#1e3a8a] px-4 pt-4 pb-4 text-white sm:px-6 sm:pt-5">
          <span aria-hidden="true" className="cmd-grade-pontos pointer-events-none absolute inset-0" />
          <span aria-hidden="true" className="cmd-orbe pointer-events-none absolute -top-24 -right-10 size-72 rounded-full bg-accent-500/30 blur-3xl" />
          <span aria-hidden="true" className="cmd-orbe cmd-orbe--b pointer-events-none absolute -bottom-24 left-1/3 size-64 rounded-full bg-gold-500/20 blur-3xl" />

          <div className="relative flex items-start gap-4">
            <BotaoVoltar onClick={onClose} rotulo="Mapa" disabled={busy} />
            <span className="hidden size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-gold-400 to-gold-500 text-navy-900 shadow-[0_10px_24px_-8px_rgba(242,193,78,0.8)] xl:flex">
              <Vote aria-hidden="true" className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-[0.625rem] font-bold tracking-[0.16em] text-gold-400 uppercase">
                Votação 2026 · resultado do TSE
                <span className="inline-flex items-center gap-1 rounded-pill bg-success-400/15 px-1.5 py-0.5 tracking-wider text-success-400">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-success-400 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-success-400" />
                  </span>
                  ao vivo
                </span>
              </p>
              <h2 className="mt-1 text-xl leading-tight font-bold sm:text-2xl">Escolha quem vai para o mapa</h2>
              <p className="mt-1 max-w-2xl text-xs text-white/70 sm:text-sm">
                Quantos candidatos quiser, cada um com a sua cor. O mapa mostra onde cada um teve voto contra a
                estimativa do time — escola, zona e seção.
              </p>
              <p className="mt-2 text-[0.6875rem] text-white/60" role="status">
                {erroAoVivo
                  ? `A busca ao vivo falhou: ${erroAoVivo}`
                  : situacao?.pausadoAte
                    ? `O TSE pediu uma pausa; a coleta volta às ${new Date(situacao.pausadoAte).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                    : (andamento ?? 'Buscando os boletins de urna no TSE…')}
                {coletando && andamento ? ' · buscando novos boletins…' : ''}
              </p>
            </div>

            {situacao?.totalDeSecoes ? <AnelDasSecoes pct={secoesPct} /> : null}
          </div>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_24rem] 2xl:grid-cols-[minmax(0,1fr)_28rem]">
          {/* COLUNA DA ESCOLHA */}
          <div className="scrollbar-slim min-h-0 overflow-y-auto">
            <div className="sticky top-0 z-10 space-y-2.5 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative flex min-w-0 flex-1 basis-64 items-center">
                  <span className="sr-only">Buscar candidato</span>
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 size-5 text-ink-400" />
                  <input
                    ref={campoDeBusca}
                    type="search"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Nome ou número do candidato"
                    className="min-h-12 w-full rounded-pill border border-line bg-surface pr-4 pl-11 text-[0.9375rem] text-ink-900 shadow-card transition-shadow placeholder:text-ink-400 focus:border-accent-600 focus:ring-4 focus:ring-accent-100 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
                  />
                  {busca ? (
                    <button
                      type="button"
                      onClick={() => setBusca('')}
                      aria-label="Limpar busca"
                      className="absolute right-2 flex size-8 items-center justify-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-900"
                    >
                      <X aria-hidden="true" className="size-4" />
                    </button>
                  ) : null}
                </label>
                <button
                  type="button"
                  aria-pressed={soFavoritos}
                  onClick={() => setSoFavoritos((atual) => !atual)}
                  className={cn(
                    'inline-flex min-h-12 items-center gap-1.5 rounded-pill border px-4 text-sm font-semibold transition-all',
                    soFavoritos ? 'border-gold-600 bg-gold-500 text-navy-900 shadow-card' : 'border-line bg-surface text-ink-700 hover:bg-gold-50',
                  )}
                >
                  <Star aria-hidden="true" className={cn('size-4', soFavoritos && 'fill-current')} />
                  Favoritos ({favoritos.size})
                </button>
                {turnos.length > 1
                  ? turnos.map((t) => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={turnoAtivo === t}
                        onClick={() => setTurno(t)}
                        className={cn(
                          'inline-flex min-h-12 items-center rounded-pill border px-4 text-sm font-semibold transition-colors',
                          turnoAtivo === t ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-surface text-ink-700 hover:bg-ink-50',
                        )}
                      >
                        {t}º turno
                      </button>
                    ))
                  : null}
              </div>

              {/* Os cargos em botoes, com quantos candidatos cada um tem. */}
              <div role="group" aria-label="Cargo" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
                {[{ codigo: null as number | null, nome: 'Todos os cargos' }, ...cargos].map((c) => {
                  const ligado = cargo === c.codigo;
                  const quantosNoCargo = c.codigo === null ? null : contagemPorCargo.get(c.codigo) ?? 0;
                  return (
                    <button
                      key={c.codigo ?? 'todos'}
                      type="button"
                      aria-pressed={ligado}
                      onClick={() => setCargo(c.codigo)}
                      className={cn(
                        'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-pill border px-3 text-xs font-semibold transition-all duration-200',
                        ligado
                          ? 'border-accent-600 bg-accent-600 text-white shadow-[0_6px_16px_-8px_rgba(37,99,235,0.8)]'
                          : 'border-line bg-surface text-ink-700 hover:border-accent-100 hover:bg-accent-50',
                      )}
                    >
                      {c.nome}
                      {quantosNoCargo !== null ? (
                        <span className={cn('rounded-pill px-1.5 py-0.5 text-[0.625rem] tabular-nums', ligado ? 'bg-white/20' : 'bg-ink-100 text-ink-500')}>
                          {formatNumber(quantosNoCargo)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <label className="flex items-center gap-2 text-xs text-ink-700">
                <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} className="size-4 accent-accent-600" />
                Mostrar também voto de legenda, branco e nulo
              </label>
            </div>

            <div className="space-y-4 px-4 py-4 sm:px-6">
              {aviso ? (
                <p role="alert" className="cmd-chip-entra rounded-control border border-gold-500/40 bg-gold-50 px-3 py-2 text-sm text-gold-700">
                  {aviso}
                </p>
              ) : null}

              {error ? (
                <p className="rounded-control border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
                  Não foi possível carregar a votação.
                </p>
              ) : lista === null ? (
                <ListaCarregando />
              ) : lista.length === 0 ? (
                <p className="rounded-card border border-line bg-surface px-4 py-8 text-center text-sm text-ink-700">
                  {erroAoVivo
                    ? 'Nenhum boletim de urna ainda: a busca no TSE não está funcionando (veja o motivo no topo).'
                    : 'Ainda não chegou nenhum boletim de urna. A lista se atualiza sozinha conforme o TSE publica as seções.'}
                </p>
              ) : (
                <>
                  {podio.length >= 2 ? (
                    <Podio
                      candidatos={podio}
                      estatisticas={estatisticas}
                      escolhidos={escolhidos}
                      onAlternar={alternar}
                    />
                  ) : null}

                  <p className="text-xs text-ink-500">
                    {achados.length === 0
                      ? null
                      : `${formatNumber(achados.length)} ${achados.length === 1 ? 'candidato' : 'candidatos'}${busca ? ` para "${busca}"` : ''} · favoritos primeiro, depois os mais votados`}
                  </p>

                  {achados.length === 0 ? (
                    <div className="rounded-card border-2 border-dashed border-line px-4 py-10 text-center text-sm text-ink-500">
                      {soFavoritos
                        ? 'Nenhum favorito aqui ainda. Toque na estrela ao lado de um candidato para favoritar.'
                        : 'Ninguém encontrado com essa busca.'}
                    </div>
                  ) : (
                    <ul className="grid gap-2 2xl:grid-cols-2">
                      {achados.slice(0, quantos).map((c, i) => (
                        <LinhaDoCandidato
                          key={c.id}
                          c={c}
                          indice={i}
                          estatistica={estatisticas.get(chaveDoCargo(c))}
                          posicaoNaEscolha={escolhidos.findIndex((x) => x.id === c.id)}
                          favorito={favoritos.has(chaveDoFavorito(c))}
                          onAlternar={() => alternar(c)}
                          onFavorito={() => alternarFavorito(c)}
                        />
                      ))}
                    </ul>
                  )}

                  {achados.length > quantos ? (
                    <button
                      type="button"
                      onClick={() => setLeva({ chave: chaveDoFiltro, quantos: quantos + LEVA })}
                      className="w-full rounded-card border border-line bg-surface py-3 text-sm font-semibold text-accent-700 transition-colors hover:bg-accent-50"
                    >
                      Mostrar mais {formatNumber(Math.min(LEVA, achados.length - quantos))} de {formatNumber(achados.length - quantos)}
                    </button>
                  ) : null}
                </>
              )}

              {podeEnviar ? <EnvioDaPlanilha onEnviando={setEnviando} onFim={reload} /> : null}
            </div>
          </div>

          {/* SUA SELECAO (computador) */}
          <aside className="hidden min-h-0 flex-col border-l border-line bg-surface lg:flex">
            <SuaSelecao
              escolhidos={escolhidos}
              estatisticas={estatisticas}
              onTirar={(id) => setEscolhidos((atual) => atual.filter((x) => x.id !== id))}
              onLimpar={() => setEscolhidos([])}
              onConfirmar={confirmar}
              podeConfirmar={podeConfirmar}
            />
          </aside>
        </div>

        {/* PASSO 2: o municipio, por cima da escolha (que continua ali para voltar). */}
        {passo === 'municipio' ? (
          <EscolhaDoMunicipio
            candidatos={escolhidos}
            campanha={campanha}
            iniciais={municipiosIniciais}
            onVoltar={voltarDoMunicipio}
            onConfirmar={(municipios) => onConfirm(escolhidos, municipios)}
          />
        ) : null}

        {/* SUA SELECAO (celular): a barra de baixo. */}
        <div className="safe-bottom flex shrink-0 flex-col gap-2 border-t border-line bg-surface px-4 py-3 lg:hidden">
          {escolhidos.length > 0 ? (
            <ul className="scrollbar-slim flex max-h-28 flex-wrap gap-1.5 overflow-y-auto" aria-label="Candidatos escolhidos">
              {escolhidos.map((c, i) => (
                <li key={c.id} className="cmd-chip-entra">
                  <button
                    type="button"
                    onClick={() => alternar(c)}
                    title={`Tirar ${c.nome}`}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-pill border border-line bg-surface py-0.5 pr-2 pl-0.5 text-left text-xs font-semibold text-ink-900"
                  >
                    <FotoDoCandidato cargo={c.cargoCodigo} sqcand={c.sqcand ?? null} src={fotoDoCandidatoUrl(c)} nome={c.nome} tamanho="xs" />
                    <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: corDoCandidato(i) }} />
                    <span className="wrap-break-word">{c.nome}</span>
                    <X aria-hidden="true" className="size-3 shrink-0 text-ink-400" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-500">Toque nos candidatos para escolher — quantos quiser.</p>
          )}
          <BotaoVerNoMapa quantos={escolhidos.length} podeConfirmar={podeConfirmar} onClick={confirmar} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------
   Pecas
   ------------------------------------------------------------------------- */

function AnelDasSecoes({ pct: valor }: { pct: number }) {
  const raio = 26;
  const volta = 2 * Math.PI * raio;
  return (
    <div className="relative hidden size-[4.5rem] shrink-0 sm:block" role="img" aria-label={`${Math.round(valor)}% das seções com boletim`}>
      <svg viewBox="0 0 64 64" className="size-full -rotate-90">
        <circle cx="32" cy="32" r={raio} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={raio}
          fill="none"
          stroke="#f2c14e"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={volta}
          strokeDashoffset={volta * (1 - valor / 100)}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-sm font-bold tabular-nums">
          <Contador valor={Math.round(valor)} formatar={(n) => `${n}%`} />
        </span>
        <span className="mt-0.5 text-[0.5rem] tracking-wider text-white/60 uppercase">seções</span>
      </span>
    </div>
  );
}

const MEDALHAS = [
  { anel: 'ring-gold-400', fundo: 'from-gold-400 to-gold-500', texto: 'text-navy-900', altura: 100 },
  { anel: 'ring-ink-200', fundo: 'from-ink-100 to-ink-200', texto: 'text-ink-700', altura: 74 },
  { anel: 'ring-[#d99a63]', fundo: 'from-[#f3c9a1] to-[#d99a63]', texto: 'text-[#5a3410]', altura: 56 },
];

/** Os tres mais votados do cargo, em colunas que sobem. */
function Podio({
  candidatos,
  estatisticas,
  escolhidos,
  onAlternar,
}: {
  candidatos: CandidatoDaVotacao[];
  estatisticas: Map<string, Estatistica>;
  escolhidos: CandidatoDaVotacao[];
  onAlternar: (c: CandidatoDaVotacao) => void;
}) {
  // Ordem do podio: 2o, 1o, 3o.
  const ordem = [candidatos[1], candidatos[0], candidatos[2]].filter(Boolean) as CandidatoDaVotacao[];
  const maior = candidatos[0]?.total || 1;
  return (
    <section aria-label="Pódio do cargo" className="overflow-hidden rounded-card border border-line bg-gradient-to-b from-surface to-gold-50/60 px-3 pt-3 shadow-card">
      <h3 className="flex items-center gap-2 px-1 text-sm font-semibold text-ink-900">
        <Trophy aria-hidden="true" className="size-4 text-gold-600" />
        Pódio · {candidatos[0]?.cargo}
      </h3>
      <div className="mt-2 grid grid-cols-3 items-end gap-2 sm:gap-4">
        {ordem.map((c) => {
          const lugar = candidatos.indexOf(c);
          const m = MEDALHAS[lugar];
          const est = estatisticas.get(chaveDoCargo(c));
          const posicao = escolhidos.findIndex((x) => x.id === c.id);
          const altura = Math.max(m.altura * 0.45, (c.total / maior) * m.altura);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onAlternar(c)}
              aria-pressed={posicao >= 0}
              className="group flex flex-col items-center text-center"
            >
              <span className="relative">
                <span className={cn('block rounded-full ring-4 transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-105', m.anel)}>
                  <FotoDoCandidato cargo={c.cargoCodigo} sqcand={c.sqcand ?? null} src={fotoDoCandidatoUrl(c)} nome={c.nome} tamanho={lugar === 0 ? 'lg' : 'md'} />
                </span>
                {lugar === 0 ? (
                  <span className="absolute -top-3 left-1/2 flex size-7 -translate-x-1/2 items-center justify-center rounded-full bg-gold-500 text-navy-900 shadow-card">
                    <Crown aria-hidden="true" className="size-4" />
                  </span>
                ) : null}
                {posicao >= 0 ? (
                  <span
                    className="cmd-chip-entra absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full text-white ring-2 ring-surface"
                    style={{ background: corDoCandidato(posicao) }}
                  >
                    <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                  </span>
                ) : null}
              </span>
              <span className="mt-2 text-xs leading-tight font-semibold wrap-break-word text-ink-900 sm:text-sm">{c.nome}</span>
              <span className="mt-0.5 text-[0.6875rem] text-ink-500 tabular-nums">
                {formatNumber(c.total)} votos{est?.validos ? ` · ${pct((c.total / est.validos) * 100)}` : ''}
              </span>
              {/* A coluna do podio, que cresce ate a altura do lugar. */}
              <span
                className={cn('cmd-coluna mt-2 flex w-full items-start justify-center rounded-t-xl bg-gradient-to-b pt-2 text-lg font-black shadow-inner', m.fundo, m.texto)}
                style={{ height: `${altura}px`, '--cmd-atraso': `${lugar * 140}ms` } as CSSProperties}
              >
                {lugar + 1}º
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function LinhaDoCandidato({
  c,
  indice,
  estatistica,
  posicaoNaEscolha,
  favorito,
  onAlternar,
  onFavorito,
}: {
  c: CandidatoDaVotacao;
  indice: number;
  estatistica: Estatistica | undefined;
  posicaoNaEscolha: number;
  favorito: boolean;
  onAlternar: () => void;
  onFavorito: () => void;
}) {
  const escolhido = posicaoNaEscolha >= 0;
  const cor = escolhido ? corDoCandidato(posicaoNaEscolha) : null;
  const parte = estatistica?.validos ? (c.total / estatistica.validos) * 100 : null;
  const barra = estatistica?.maior ? Math.max(2, (c.total / estatistica.maior) * 100) : 0;
  const posicao = estatistica?.posicao.get(c.id) ?? null;
  return (
    <li
      className="cmd-cascata"
      style={{ '--cmd-atraso': `${Math.min(indice, 12) * 30}ms` } as CSSProperties}
    >
      <div
        className={cn(
          'group relative flex items-center overflow-hidden rounded-card border bg-surface transition-all duration-200',
          escolhido ? 'shadow-raised' : 'border-line hover:-translate-y-0.5 hover:border-accent-100 hover:shadow-raised',
        )}
        style={cor ? { borderColor: cor, boxShadow: `0 0 0 1px ${cor}, 0 12px 24px -16px ${cor}` } : undefined}
      >
        {cor ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: cor }} /> : null}

        <button
          type="button"
          onClick={onFavorito}
          aria-pressed={favorito}
          aria-label={favorito ? `Tirar ${c.nome} dos favoritos` : `Favoritar ${c.nome}`}
          title={favorito ? 'Tirar dos favoritos' : 'Favoritar'}
          className="flex w-10 shrink-0 items-center justify-center self-stretch text-ink-300 transition-colors hover:text-gold-600 sm:w-12"
        >
          <Star aria-hidden="true" className={cn('size-5 transition-transform', favorito ? 'scale-110 fill-gold-500 text-gold-600' : 'text-ink-400')} />
        </button>

        <button
          type="button"
          onClick={onAlternar}
          aria-pressed={escolhido}
          className="flex min-w-0 flex-1 items-center gap-2.5 py-3 pr-2.5 text-left sm:gap-3 sm:pr-3"
        >
          {/* A foto oficial do TSE, com o numero de urna colado embaixo. */}
          <span className="relative shrink-0 pb-1.5">
            <FotoDoCandidato
              cargo={c.cargoCodigo}
              sqcand={c.sqcand ?? null}
              src={c.tipo === 'CANDIDATO' ? fotoDoCandidatoUrl(c) : undefined}
              nome={c.nome}
              tamanho="md"
            />
            <span className="absolute inset-x-0 -bottom-0.5 mx-auto w-fit rounded-pill bg-navy-900 px-1.5 text-[0.625rem] leading-4 font-bold text-white tabular-nums ring-2 ring-surface">
              {c.numero}
            </span>
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-sm leading-snug font-semibold wrap-break-word text-ink-900 sm:text-[0.9375rem]">{c.nome}</span>
              {posicao !== null && posicao <= 3 && c.tipo === 'CANDIDATO' ? (
                <span className={cn('inline-flex items-center gap-0.5 rounded-pill px-1.5 py-0.5 text-[0.625rem] font-bold', posicao === 1 ? 'bg-gold-100 text-gold-700' : 'bg-ink-100 text-ink-700')}>
                  {posicao === 1 ? <Crown aria-hidden="true" className="size-3" /> : null}
                  {posicao}º
                </span>
              ) : null}
            </span>
            <span className="block text-xs text-ink-500">
              {c.cargo} · {c.turno}º turno · {c.uf}
              {posicao !== null && c.tipo === 'CANDIDATO' ? ` · ${posicao}º no cargo` : ''}
            </span>
            {/* A barra dos votos, contra o mais votado do cargo. */}
            <span className="mt-1.5 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-ink-100">
                <span
                  className="cmd-barra-viva block h-full rounded-pill"
                  style={{
                    width: `${barra}%`,
                    background: cor ?? 'linear-gradient(90deg, #2563eb, #4f9bff)',
                    '--cmd-atraso': `${120 + Math.min(indice, 12) * 30}ms`,
                  } as CSSProperties}
                />
              </span>
              {parte !== null ? (
                <span className="w-12 shrink-0 text-right text-[0.6875rem] font-semibold text-ink-700 tabular-nums">{pct(parte)}</span>
              ) : null}
            </span>
            {/* No celular os votos descem para ca: o nome fica com a largura. */}
            <span className="mt-1 block text-xs font-bold text-brand-800 tabular-nums sm:hidden">
              {formatNumber(c.total)} <span className="font-normal text-ink-500">votos</span>
            </span>
          </span>

          <span className="hidden shrink-0 text-right tabular-nums sm:block">
            <span className="block text-base font-bold text-brand-800">{formatNumber(c.total)}</span>
            <span className="block text-[0.6875rem] text-ink-500">votos</span>
            {/* O total oficial do TSE anda na frente durante a apuracao. */}
            {c.totalOficial !== null && c.totalOficial > c.total ? (
              <span className="block text-[0.625rem] text-ink-400">TSE: {formatNumber(c.totalOficial)}</span>
            ) : null}
          </span>

          {/* A marca da escolha, na cor que o candidato tera no mapa e no PDF. */}
          <span
            aria-hidden="true"
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300',
              escolhido ? 'scale-110 border-transparent text-white' : 'border-ink-200 text-transparent group-hover:border-accent-400 group-hover:text-accent-400',
            )}
            style={cor ? { background: cor } : undefined}
          >
            {escolhido ? <Check className="cmd-chip-entra size-4" strokeWidth={3} /> : <Plus className="size-4" strokeWidth={2.5} />}
          </span>
        </button>
      </div>
    </li>
  );
}

function SuaSelecao({
  escolhidos,
  estatisticas,
  onTirar,
  onLimpar,
  onConfirmar,
  podeConfirmar,
}: {
  escolhidos: CandidatoDaVotacao[];
  estatisticas: Map<string, Estatistica>;
  onTirar: (id: string) => void;
  onLimpar: () => void;
  onConfirmar: () => void;
  podeConfirmar: boolean;
}) {
  const maior = Math.max(1, ...escolhidos.map((c) => c.total));
  const soma = escolhidos.reduce((s, c) => s + c.total, 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-slim min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            Sua seleção
            <span className="rounded-pill bg-navy-900 px-2 py-0.5 text-xs font-bold text-gold-400 tabular-nums">
              {escolhidos.length}
            </span>
          </h3>
          {escolhidos.length > 1 ? (
            <button
              type="button"
              onClick={onLimpar}
              className="inline-flex min-h-8 items-center gap-1 rounded-pill px-2.5 text-xs font-semibold text-ink-500 transition-colors hover:bg-danger-50 hover:text-danger-600"
            >
              <X aria-hidden="true" className="size-3.5" />
              Tirar todos
            </button>
          ) : null}
        </div>

        {/* Sem limite: cada escolhido na cor do mapa, e sempre uma vaga a mais. */}
        <ol className="space-y-2">
          {escolhidos.map((c, i) => {
            const cor = corDoCandidato(i);
            const est = estatisticas.get(chaveDoCargo(c));
            return (
              <li
                key={c.id}
                className="cmd-bandeja relative flex items-center gap-3 overflow-hidden rounded-card border bg-surface px-3 py-2.5 shadow-card"
                style={{ borderColor: cor }}
              >
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: cor }} />
                <span className="rounded-full ring-2 ring-offset-2" style={{ '--tw-ring-color': cor } as CSSProperties}>
                  <FotoDoCandidato cargo={c.cargoCodigo} sqcand={c.sqcand ?? null} src={fotoDoCandidatoUrl(c)} nome={c.nome} tamanho="sm" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug font-semibold wrap-break-word text-ink-900">{c.nome}</span>
                  <span className="block text-[0.6875rem] text-ink-500">
                    {c.cargo} · {c.numero}
                    {est?.posicao.get(c.id) ? ` · ${est.posicao.get(c.id)}º` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onTirar(c.id)}
                  aria-label={`Tirar ${c.nome}`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-danger-50 hover:text-danger-600"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </li>
            );
          })}
          <li className="flex items-center gap-3 rounded-card border-2 border-dashed border-line px-3 py-2.5 text-xs text-ink-400">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-dashed"
              style={{ borderColor: corDoCandidato(escolhidos.length), color: corDoCandidato(escolhidos.length) }}
            >
              <Plus aria-hidden="true" className="size-4" />
            </span>
            {escolhidos.length === 0 ? 'Toque num candidato para escolher' : 'Quer mais? Toque em outro candidato'}
          </li>
        </ol>

        {/* O grafico: os escolhidos lado a lado. */}
        {escolhidos.length > 0 ? (
          <section aria-label="Comparação dos escolhidos" className="rounded-card border border-line bg-canvas/60 p-3">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-ink-700">
              <ChartBar aria-hidden="true" className="size-3.5 text-accent-600" />
              Votos lado a lado
            </h4>
            <ul className="mt-2.5 space-y-2.5">
              {escolhidos.map((c, i) => (
                <li key={c.id}>
                  <div className="flex items-baseline justify-between gap-2 text-[0.6875rem]">
                    <span className="font-semibold wrap-break-word text-ink-900">{c.nome}</span>
                    <span className="shrink-0 font-bold text-ink-900 tabular-nums">
                      <Contador valor={c.total} />
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-pill bg-ink-100">
                    <div
                      className="h-full rounded-pill transition-[width] duration-700 ease-out"
                      style={{ width: `${Math.max(3, (c.total / maior) * 100)}%`, background: corDoCandidato(i) }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            {escolhidos.length > 1 ? (
              <p className="mt-3 border-t border-line pt-2 text-[0.6875rem] text-ink-500">
                Juntos: <b className="text-ink-900 tabular-nums">{formatNumber(soma)}</b> votos
              </p>
            ) : null}
          </section>
        ) : (
          <div className="rounded-card bg-gradient-to-br from-accent-50 to-gold-50 p-4 text-center">
            <MapPinned aria-hidden="true" className="mx-auto size-8 text-accent-600" />
            <p className="mt-2 text-sm font-semibold text-ink-900">Monte a sua seleção</p>
            <p className="mt-1 text-xs text-ink-500">
              Escolha a dobradinha, os adversários, a chapa inteira — quantos quiser. Cada um ganha uma cor no mapa.
            </p>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line p-4">
        <BotaoVerNoMapa quantos={escolhidos.length} podeConfirmar={podeConfirmar} onClick={onConfirmar} />
      </div>
    </div>
  );
}

function BotaoVerNoMapa({ quantos, podeConfirmar, onClick }: { quantos: number; podeConfirmar: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!podeConfirmar}
      className={cn(
        'group relative inline-flex min-h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-pill px-5 text-[0.9375rem] font-bold transition-all duration-300',
        quantos > 0
          ? 'bg-gradient-to-r from-gold-400 to-gold-500 text-navy-900 shadow-[0_12px_28px_-10px_rgba(242,193,78,0.9)] hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-10px_rgba(242,193,78,1)]'
          : 'bg-navy-900 text-white hover:bg-navy-800',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0',
      )}
    >
      {quantos > 0 ? <span aria-hidden="true" className="cmd-cta__brilho" /> : null}
      <MapPinned aria-hidden="true" className="relative size-5" />
      <span className="relative">{quantos === 0 ? 'Voltar ao mapa da campanha' : `Ver no mapa (${quantos})`}</span>
      {quantos > 0 ? <ArrowRight aria-hidden="true" className="relative size-4 transition-transform group-hover:translate-x-1" /> : null}
    </button>
  );
}

function ListaCarregando() {
  return (
    <div className="space-y-2" role="status" aria-label="Carregando a votação">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex animate-shimmer items-center gap-3 rounded-card border border-line bg-surface p-3" style={{ animationDelay: `${i * 90}ms` }}>
          <span className="size-12 shrink-0 rounded-full bg-ink-100" />
          <span className="flex-1 space-y-2">
            <span className="block h-3.5 w-1/2 rounded bg-ink-100" />
            <span className="block h-2.5 w-1/3 rounded bg-ink-100" />
            <span className="block h-1.5 w-full rounded bg-ink-100" />
          </span>
          <span className="h-6 w-14 rounded bg-ink-100" />
        </div>
      ))}
      <p className="flex items-center justify-center gap-2 pt-2 text-xs text-ink-500">
        <Spinner className="size-3.5" /> Carregando a votação…
      </p>
    </div>
  );
}

/** Rodape do ADMIN: enviar a planilha de votacao por secao do TSE. */
function EnvioDaPlanilha({ onEnviando, onFim }: { onEnviando: (sim: boolean) => void; onFim: () => void }) {
  const campo = useRef<HTMLInputElement>(null);
  const [andamento, setAndamento] = useState<Andamento | null>(null);
  const [resumo, setResumo] = useState<ResumoDoEnvio | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(arquivo: File) {
    setErro(null);
    setResumo(null);
    onEnviando(true);
    try {
      setResumo(await importarVotacao(arquivo, setAndamento));
      onFim();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler a planilha.');
    } finally {
      setAndamento(null);
      onEnviando(false);
      if (campo.current) campo.current.value = '';
    }
  }

  return (
    <section className="space-y-2 rounded-card border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink-900">Enviar a votação do TSE</h3>
      <p className="text-xs text-ink-500">
        No Portal de Dados Abertos do TSE (dadosabertos.tse.jus.br), baixe <b>Resultados 2026 → Votação por seção
        eleitoral</b>, o arquivo de <b>AL</b>, e envie o .zip como veio. A planilha é lida aqui no navegador e pode levar
        alguns minutos. Enviar de novo (por exemplo, com o 2º turno) atualiza sem duplicar.
      </p>

      <input
        ref={campo}
        type="file"
        accept=".zip,.csv,.txt"
        className="sr-only"
        id="arquivo-votacao"
        disabled={andamento !== null}
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (arquivo) void enviar(arquivo);
        }}
      />
      <label
        htmlFor="arquivo-votacao"
        className={cn(
          'inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-control border border-brand-200 bg-surface px-3 text-sm font-semibold text-brand-800 hover:bg-brand-50',
          andamento && 'pointer-events-none opacity-60',
        )}
      >
        <Upload aria-hidden="true" className="size-4" />
        Escolher arquivo (.zip ou .csv)
      </label>

      {andamento ? (
        <div className="space-y-1" role="status">
          <p className="text-xs text-ink-700">{andamento.texto}</p>
          <div className="h-1.5 w-full overflow-hidden rounded-pill bg-ink-100">
            <div className="h-full rounded-pill bg-brand-600 transition-all" style={{ width: `${Math.round(andamento.fracao * 100)}%` }} />
          </div>
        </div>
      ) : null}

      {resumo ? (
        <p className="rounded-control border border-success-600/30 bg-success-50 px-3 py-2 text-xs text-success-700" role="status">
          Pronto: {formatNumber(resumo.candidatos)} candidatos em {formatNumber(resumo.secoes)} seções ({resumo.cargos.join(', ')}).
          {resumo.ignoradas > 0 ? ` ${formatNumber(resumo.ignoradas)} linhas incompletas foram ignoradas.` : ''}
        </p>
      ) : null}

      {erro ? (
        <p className="rounded-control border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700" role="alert">
          {erro}
        </p>
      ) : null}
    </section>
  );
}
