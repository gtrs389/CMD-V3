'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Crown, Flame, MapPin, Plus, Search, Swords, Target, Trophy, Users, X, Zap } from 'lucide-react';
import type { EscolaNoComparativo, LiderNoRaioX } from '@/lib/domain/confronto';
import { montarDuelo, parteDaEsquerda, votosDoComparativo, votosNaEscola, type SecaoNoDuelo } from '@/lib/domain/sala-de-confronto';
import {
  cargosDaVotacao,
  filtrarCandidatos,
  fotoDoCandidatoUrl,
  rotuloDoCandidato,
  type CandidatoDaVotacao,
  type VotacaoNoMapa,
} from '@/lib/domain/votacao-tse';
import { FotoDoCandidato } from '@/components/apuracao/FotoDoCandidato';
import { Contador } from '@/components/ui/Contador';
import { Spinner } from '@/components/ui/Spinner';
import { SeloDaReferencia } from '@/components/members/TagDaReferencia';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { cn } from '@/lib/utils/cn';
import { formatNumber, initials } from '@/lib/utils/text';
import { BotaoVoltar } from './EscolhaDoMunicipio';
import { corDoCandidato } from './cores';
import type { CandidatoNoRaioX } from './RaioXDaEscola';

/**
 * Sala de Confronto: a escola do raio-x virada arena.
 *
 * Do lado ESQUERDO, os candidatos que vieram do mapa (os escolhidos antes);
 * do lado DIREITO, quem o usuario chamar para o duelo — quantos quiser, de
 * qualquer cargo. Os votos de cada lado se somam secao por secao: quem tem
 * mais leva a secao. Em cima, o placar e o cabo de guerra; no meio, o que
 * importa (secoes vencidas, a mais disputada, quantos votos faltaram para
 * virar, o que aconteceu onde os Lideres selecionados tem gente); embaixo,
 * secao por secao, as barras de um lado contra as do outro.
 *
 * Abre por cima do raio-x, na tela inteira; o voltar vermelho (ou o Esc)
 * volta para ele com tudo como estava — inclusive os Lideres selecionados.
 */

/** As cores dos dois lados: azul (o nosso) e vermelho (o adversario). */
const AZUL = '#2a78d6';
const VERMELHO = '#e5484d';

/** Quantos nomes a lista do seletor mostra de cada vez. */
const LEVA = 50;

type Filtro = 'todas' | 'ganhas' | 'perdidas' | 'empates' | 'lideres';

interface Lutador extends CandidatoNoRaioX {
  /** Ainda chegando (a votacao do adversario e buscada ao entrar). */
  carregando?: boolean;
  erro?: boolean;
}

export function SalaDeConfronto({
  escola,
  candidatos,
  lideres,
  secaoNoFiltro = false,
  onClose,
}: {
  escola: EscolaNoComparativo;
  /** O lado esquerdo: os candidatos do raio-x, na ordem do apurado da escola. */
  candidatos: CandidatoNoRaioX[];
  /** Os Lideres selecionados no raio-x (podem ser nenhum). */
  lideres: LiderNoRaioX[];
  /** O mapa esta filtrado por uma secao: o duelo fica so nas secoes do raio-x. */
  secaoNoFiltro?: boolean;
  onClose: () => void;
}) {
  const loader = useCallback(() => api<{ candidatos: CandidatoDaVotacao[] }>('/api/votacao'), []);
  const { data, error: erroDaLista } = useRepositoryQuery(loader);
  const lista = useMemo(() => data?.candidatos ?? [], [data]);

  const [adversarios, setAdversarios] = useState<CandidatoDaVotacao[]>([]);
  const [votacoes, setVotacoes] = useState<Record<string, VotacaoNoMapa | 'erro'>>({});
  const [escolhendo, setEscolhendo] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('todas');

  const idsDaEsquerda = useMemo(() => new Set(candidatos.map((c) => c.id).filter(Boolean)), [candidatos]);
  /** O primeiro da esquerda na lista da votacao: o ano, o estado, o turno e o cargo de partida. */
  const base = useMemo(() => lista.find((c) => idsDaEsquerda.has(c.id)) ?? null, [lista, idsDaEsquerda]);
  const daEleicao = useMemo(() => (base ? lista.filter((c) => c.ano === base.ano && c.uf === base.uf) : lista), [lista, base]);

  function adicionar(c: CandidatoDaVotacao) {
    if (idsDaEsquerda.has(c.id) || adversarios.some((a) => a.id === c.id)) return;
    setAdversarios((atual) => [...atual, c]);
    if (votacoes[c.id] && votacoes[c.id] !== 'erro') return;
    setVotacoes((atual) => {
      const novo = { ...atual };
      delete novo[c.id];
      return novo;
    });
    api<VotacaoNoMapa>(`/api/votacao/${encodeURIComponent(c.id)}`)
      .then((v) => setVotacoes((atual) => ({ ...atual, [c.id]: v })))
      .catch(() => setVotacoes((atual) => ({ ...atual, [c.id]: 'erro' })));
  }
  const remover = (id: string) => setAdversarios((atual) => atual.filter((a) => a.id !== id));

  // As cores da direita nao repetem as da esquerda.
  const direita = useMemo((): Lutador[] => {
    const usadas = new Set(candidatos.map((c) => c.cor.toLowerCase()));
    const cores: string[] = [];
    for (let k = 0; cores.length < adversarios.length; k += 1) {
      if (!usadas.has(corDoCandidato(k).toLowerCase())) cores.push(corDoCandidato(k));
    }
    return adversarios.map((c, i) => {
      const cor = cores[i];
      const v = votacoes[c.id];
      return {
        id: c.id,
        nome: c.nome,
        rotulo: rotuloDoCandidato(c),
        cor,
        cargo: c.cargoCodigo,
        foto: fotoDoCandidatoUrl(c),
        carregando: v === undefined,
        erro: v === 'erro',
      };
    });
  }, [adversarios, votacoes, candidatos]);

  /** So os adversarios que ja chegaram entram na conta (na ordem da direita). */
  const prontos = direita.filter((c) => !c.carregando && !c.erro);
  const duelo = useMemo(() => {
    const esquerda = candidatos.map((_, i) => votosDoComparativo(escola, i));
    const dir = adversarios
      .map((a) => votacoes[a.id])
      .filter((v): v is VotacaoNoMapa => v !== undefined && v !== 'erro')
      .map((v) => votosNaEscola(escola, [...v.noMapa, ...v.foraDoMapa], secaoNoFiltro));
    return montarDuelo(escola, esquerda, dir, lideres);
  }, [escola, candidatos, adversarios, votacoes, lideres, secaoNoFiltro]);

  const temAdversario = prontos.length > 0;
  const parte = parteDaEsquerda(duelo);

  // Esc: fecha o seletor, se aberto; senao volta para o raio-x.
  const seletorAberto = useRef(false);
  useEffect(() => {
    seletorAberto.current = escolhendo;
  }, [escolhendo]);
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (seletorAberto.current) setEscolhendo(false);
      else onClose();
    };
    document.addEventListener('keydown', aoTeclar, true);
    return () => document.removeEventListener('keydown', aoTeclar, true);
  }, [onClose]);

  const sugestoes = useMemo(() => {
    if (!base) return [];
    return filtrarCandidatos(daEleicao, {
      turno: base.turno,
      cargoCodigo: base.cargoCodigo,
      busca: '',
    })
      .filter((c) => !idsDaEsquerda.has(c.id) && !adversarios.some((a) => a.id === c.id))
      .slice(0, 4);
  }, [base, daEleicao, idsDaEsquerda, adversarios]);

  const onde = [escola.endereco, [escola.cidade, escola.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ');
  const nSecoes = duelo.secoes.length;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Sala de Confronto: ${escola.titulo}`}
      className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-canvas"
    >
      {/* CABECALHO */}
      <header className="relative shrink-0 overflow-hidden bg-gradient-to-r from-[#0d1f4d] via-navy-900 to-[#4a0d16] px-4 py-4 text-white sm:px-6">
        <span aria-hidden="true" className="cmd-grade-pontos pointer-events-none absolute inset-0" />
        <span aria-hidden="true" className="cmd-orbe pointer-events-none absolute -top-24 -left-16 size-72 rounded-full bg-[#2a78d6]/30 blur-3xl" />
        <span aria-hidden="true" className="cmd-orbe pointer-events-none absolute -right-16 -bottom-28 size-80 rounded-full bg-[#e5484d]/30 blur-3xl" />
        <div className="relative mx-auto flex max-w-[1600px] flex-wrap items-start gap-4">
          <BotaoVoltar onClick={onClose} rotulo="Raio-X" />
          <div className="min-w-0 flex-1">
            <p className="inline-flex items-center gap-1.5 rounded-pill bg-white/10 px-2.5 py-1 text-[0.6875rem] font-bold tracking-[0.16em] text-white uppercase ring-1 ring-white/15">
              <Swords aria-hidden="true" className="size-3.5 text-gold-400" /> Sala de Confronto
            </p>
            <h2 className="mt-2 text-xl leading-tight font-bold wrap-break-word sm:text-2xl">{escola.titulo}</h2>
            {onde ? (
              <p className="mt-0.5 flex items-start gap-1.5 text-sm text-white/70">
                <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span className="wrap-break-word">{onde}</span>
              </p>
            ) : null}
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/70">
              <span>
                <b className="text-white tabular-nums">{formatNumber(nSecoes)}</b> {nSecoes === 1 ? 'seção' : 'seções'} em disputa
              </span>
              <span>
                estimativa do time <b className="text-white tabular-nums">{formatNumber(escola.estimativa)}</b>
              </span>
              {lideres.length ? (
                <span className="inline-flex items-center gap-1">
                  <Users aria-hidden="true" className="size-3.5 text-gold-400" />
                  <b className="text-gold-400 tabular-nums">{lideres.length}</b> {lideres.length === 1 ? 'líder selecionado' : 'líderes selecionados'}
                </span>
              ) : null}
            </p>
          </div>
        </div>
      </header>

      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-5 sm:px-6">
          {/* A ARENA: esquerda x direita */}
          <section
            aria-label="Placar do confronto"
            className="animate-fade-up overflow-hidden rounded-card bg-gradient-to-br from-navy-900 via-navy-800 to-[#2b0f1c] p-4 text-white shadow-overlay sm:p-5"
          >
            <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
              <Lado
                titulo="Seu lado"
                subtitulo="Os candidatos que você escolheu"
                cor={AZUL}
                lutadores={candidatos}
                votos={duelo.esquerda}
                total={duelo.totalEsquerda}
                totalDaEscola={duelo.totalEsquerda + duelo.totalDireita}
              />

              <Centro esquerda={duelo.totalEsquerda} direita={duelo.totalDireita} vitorias={duelo.vitorias} temAdversario={temAdversario} />

              <Lado
                titulo="Adversários"
                subtitulo="Quem vai para o confronto"
                cor={VERMELHO}
                lutadores={direita}
                votos={direita.map((c) => {
                  const i = prontos.findIndex((p) => p.id === c.id);
                  return i >= 0 ? duelo.direita[i] : 0;
                })}
                total={duelo.totalDireita}
                totalDaEscola={duelo.totalEsquerda + duelo.totalDireita}
                direita
                onRemover={remover}
                onAdicionar={() => setEscolhendo(true)}
                vazio={
                  <ChamadaDoAdversario sugestoes={sugestoes} carregando={!data && !erroDaLista} onEscolher={adicionar} onAbrir={() => setEscolhendo(true)} />
                }
              />
            </div>

            <CaboDeGuerra parte={parte} ativo={temAdversario} />
          </section>

          {temAdversario ? (
            <>
              <Leituras duelo={duelo} lideres={lideres} />
              <SecaoPorSecao
                secoes={duelo.secoes}
                esquerda={candidatos}
                direita={prontos}
                filtro={filtro}
                onFiltro={setFiltro}
                comLideres={lideres.length > 0}
              />
              <Ranking esquerda={candidatos} votosEsquerda={duelo.esquerda} direita={prontos} votosDireita={duelo.direita} />
            </>
          ) : (
            <div className="rounded-card border-2 border-dashed border-line bg-surface px-4 py-10 text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-danger-600 to-[#e0457b] text-white shadow-[0_12px_26px_-12px_rgba(220,38,38,0.9)]">
                <Swords aria-hidden="true" className="size-7" />
              </span>
              <p className="mt-3 text-base font-bold text-ink-900">Chame alguém para o confronto</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
                Escolha um ou mais candidatos do lado direito. Assim que os votos chegarem, a escola vira duelo: seção por seção, quem venceu, por quanto, e o
                que aconteceu onde os seus líderes têm gente.
              </p>
              {direita.some((c) => c.carregando) ? (
                <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-accent-700">
                  <Spinner className="size-4" /> Buscando os votos…
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {escolhendo ? (
        <Seletor
          lista={daEleicao}
          base={base}
          carregando={!data && !erroDaLista}
          erro={Boolean(erroDaLista)}
          naEsquerda={idsDaEsquerda}
          naDireita={new Set(adversarios.map((a) => a.id))}
          onAdicionar={adicionar}
          onRemover={remover}
          onClose={() => setEscolhendo(false)}
        />
      ) : null}
    </div>,
    document.body,
  );
}

/* ---------------------------------------------------------------------- */

/** Um lado da arena: os candidatos com foto, votos na escola e a parte de cada um. */
function Lado({
  titulo,
  subtitulo,
  cor,
  lutadores,
  votos,
  total,
  totalDaEscola,
  direita = false,
  onRemover,
  onAdicionar,
  vazio,
}: {
  titulo: string;
  subtitulo: string;
  cor: string;
  lutadores: Lutador[];
  votos: number[];
  total: number;
  totalDaEscola: number;
  direita?: boolean;
  onRemover?: (id: string) => void;
  onAdicionar?: () => void;
  vazio?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-card border border-white/10 bg-white/[0.04] p-3" style={{ boxShadow: `inset 0 3px 0 ${cor}` }}>
      <div className={cn('flex items-baseline justify-between gap-2', direita && 'flex-row-reverse')}>
        <div className={cn('min-w-0', direita && 'text-right')}>
          <p className="text-[0.6875rem] font-bold tracking-[0.16em] uppercase" style={{ color: cor }}>
            {titulo}
          </p>
          <p className="text-[0.6875rem] text-white/55">{subtitulo}</p>
        </div>
        <p className="text-2xl leading-none font-bold tabular-nums">
          <Contador valor={total} />
        </p>
      </div>

      {lutadores.length === 0 && vazio ? (
        <div className="mt-3 flex-1">{vazio}</div>
      ) : (
        <ul className="mt-3 space-y-2">
          {lutadores.map((c, i) => {
            const v = votos[i] ?? 0;
            const parte = totalDaEscola > 0 ? (v / totalDaEscola) * 100 : 0;
            return (
              <li
                key={c.id ?? c.rotulo}
                className={cn('cmd-cascata flex min-w-0 items-center gap-3 rounded-control bg-white/[0.06] p-2', direita && 'flex-row-reverse text-right')}
                style={
                  {
                    '--cmd-atraso': `${i * 60}ms`,
                    [direita ? 'borderRight' : 'borderLeft']: `3px solid ${c.cor}`,
                  } as CSSProperties
                }
              >
                <span className="shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-navy-800" style={{ '--tw-ring-color': c.cor } as CSSProperties}>
                  <FotoDoCandidato cargo={c.cargo} sqcand={null} src={c.foto} nome={c.nome} tamanho="md" className="ring-0" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold wrap-break-word">{c.nome}</p>
                  <p className="text-[0.6875rem] wrap-break-word text-white/55">{c.rotulo.split(' · ').slice(1).join(' · ') || c.rotulo}</p>
                  {c.carregando ? (
                    <p className={cn('mt-1 inline-flex items-center gap-1.5 text-xs text-white/70', direita && 'flex-row-reverse')}>
                      <Spinner className="size-3.5" /> buscando os votos…
                    </p>
                  ) : c.erro ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-danger-200">
                      <AlertTriangle aria-hidden="true" className="size-3.5" /> não foi possível buscar os votos
                    </p>
                  ) : (
                    <div className={cn('mt-1 flex items-center gap-2', direita && 'flex-row-reverse')}>
                      <span className="text-lg leading-none font-bold tabular-nums">
                        <Contador valor={v} />
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-white/10">
                        <span
                          className={cn('block h-full rounded-pill transition-[width] duration-1000 ease-out', direita && 'ml-auto')}
                          style={{
                            width: `${Math.max(v > 0 ? 3 : 0, parte)}%`,
                            background: c.cor,
                          }}
                        />
                      </span>
                      <span className="w-10 text-[0.6875rem] font-semibold text-white/70 tabular-nums">{Math.round(parte)}%</span>
                    </div>
                  )}
                </div>
                {onRemover && c.id ? (
                  <button
                    type="button"
                    onClick={() => onRemover(c.id!)}
                    aria-label={`Tirar ${c.nome} do confronto`}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                ) : null}
              </li>
            );
          })}
          {onAdicionar ? (
            <li>
              <button
                type="button"
                onClick={onAdicionar}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-control border-2 border-dashed border-white/20 text-sm font-semibold text-white/80 transition-colors hover:border-[#e5484d] hover:bg-[#e5484d]/10 hover:text-white"
              >
                <Plus aria-hidden="true" className="size-4" /> Adicionar adversário
              </button>
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

/** O lado direito vazio: a chamada e as sugestoes (os mais votados do mesmo cargo). */
function ChamadaDoAdversario({
  sugestoes,
  carregando,
  onEscolher,
  onAbrir,
}: {
  sugestoes: CandidatoDaVotacao[];
  carregando: boolean;
  onEscolher: (c: CandidatoDaVotacao) => void;
  onAbrir: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <button
        type="button"
        onClick={onAbrir}
        className="group flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-control border-2 border-dashed border-[#e5484d]/60 bg-[#e5484d]/10 px-3 py-4 text-center transition-all hover:border-[#e5484d] hover:bg-[#e5484d]/20"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-[#e5484d] text-white shadow-[0_0_0_6px_rgba(229,72,77,0.2)] transition-transform group-hover:scale-110">
          <Plus aria-hidden="true" className="size-5" strokeWidth={3} />
        </span>
        <span className="text-sm font-bold">Escolher adversários</span>
        <span className="text-[0.6875rem] text-white/60">quantos quiser, de qualquer cargo</span>
      </button>
      {carregando ? (
        <p className="flex items-center gap-2 text-xs text-white/60">
          <Spinner className="size-3.5" /> carregando os candidatos…
        </p>
      ) : sugestoes.length ? (
        <div>
          <p className="text-[0.6875rem] font-semibold tracking-wider text-white/50 uppercase">Sugestões · os mais votados do cargo</p>
          <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
            {sugestoes.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onEscolher(c)}
                  className="flex w-full min-w-0 items-center gap-2 rounded-control bg-white/[0.06] p-1.5 text-left transition-colors hover:bg-white/[0.14]"
                >
                  <FotoDoCandidato cargo={c.cargoCodigo} sqcand={c.sqcand ?? null} src={fotoDoCandidatoUrl(c)} nome={c.nome} tamanho="sm" className="ring-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{c.nome}</span>
                    <span className="block text-[0.625rem] text-white/55 tabular-nums">
                      {c.numero} · {formatNumber(c.total)} votos
                    </span>
                  </span>
                  <Plus aria-hidden="true" className="size-4 shrink-0 text-[#ff8a8e]" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** O meio da arena: o placar grande e as secoes vencidas de cada lado. */
function Centro({
  esquerda,
  direita,
  vitorias,
  temAdversario,
}: {
  esquerda: number;
  direita: number;
  vitorias: { esquerda: number; direita: number; empate: number };
  temAdversario: boolean;
}) {
  const lider = !temAdversario ? null : esquerda > direita ? 'esquerda' : direita > esquerda ? 'direita' : null;
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-2 py-2 lg:min-w-[15rem]">
      <span className="relative flex size-20 items-center justify-center">
        <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-gold-400/20 [animation-duration:2.4s]" />
        <span className="relative flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-navy-900 shadow-[0_0_40px_-6px_rgba(242,193,78,0.8)] ring-4 ring-white/10">
          <Swords aria-hidden="true" className="size-9" strokeWidth={2.25} />
        </span>
      </span>
      <div className="flex items-baseline gap-3 text-4xl font-black tabular-nums sm:text-5xl">
        <span
          style={{
            color: lider === 'direita' ? 'rgb(255 255 255 / 0.55)' : '#7fb6ff',
          }}
        >
          <Contador valor={esquerda} />
        </span>
        <span className="text-xl font-bold text-white/40">×</span>
        <span
          style={{
            color: lider === 'esquerda' ? 'rgb(255 255 255 / 0.55)' : temAdversario ? '#ff8a8e' : 'rgb(255 255 255 / 0.3)',
          }}
        >
          {temAdversario ? <Contador valor={direita} /> : '—'}
        </span>
      </div>
      <p className="text-[0.6875rem] font-semibold tracking-wider text-white/55 uppercase">votos na escola</p>
      {temAdversario ? (
        <div className="flex items-center gap-2 rounded-pill bg-white/[0.07] px-3 py-1.5 text-xs ring-1 ring-white/10">
          <Trophy aria-hidden="true" className="size-3.5 text-gold-400" />
          <span>
            Seções <b className="text-[#7fb6ff] tabular-nums">{vitorias.esquerda}</b> × <b className="text-[#ff8a8e] tabular-nums">{vitorias.direita}</b>
            {vitorias.empate ? (
              <span className="text-white/60">
                {' '}
                · {vitorias.empate} empate{vitorias.empate === 1 ? '' : 's'}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
      {lider ? (
        <p
          className="cmd-chip-entra inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-bold"
          style={{
            background: lider === 'esquerda' ? `${AZUL}33` : `${VERMELHO}33`,
            color: lider === 'esquerda' ? '#7fb6ff' : '#ff8a8e',
          }}
        >
          <Crown aria-hidden="true" className="size-3.5" />
          {lider === 'esquerda' ? 'Seu lado vence a escola' : 'Os adversários vencem a escola'}
        </p>
      ) : temAdversario ? (
        <p className="text-xs font-bold text-gold-400">Empate na escola</p>
      ) : null}
    </div>
  );
}

/** O cabo de guerra: a parte de cada lado nos votos da escola, com o no no ponto de equilibrio. */
function CaboDeGuerra({ parte, ativo }: { parte: number; ativo: boolean }) {
  const p = ativo ? parte : 50;
  return (
    <div className="mt-5">
      <div className="mb-1.5 flex justify-between text-xs font-bold tabular-nums">
        <span style={{ color: '#7fb6ff' }}>{ativo ? `${p.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'}</span>
        <span className="text-[0.6875rem] font-semibold tracking-wider text-white/50 uppercase">cabo de guerra</span>
        <span style={{ color: '#ff8a8e' }}>{ativo ? `${(100 - p).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'}</span>
      </div>
      <div className="relative h-4 rounded-pill bg-white/10">
        <div
          className="absolute inset-y-0 left-0 rounded-l-pill transition-[width] duration-1000 ease-out"
          style={{
            width: `${p}%`,
            background: `linear-gradient(90deg, #1d4f9a, ${AZUL})`,
          }}
        />
        <div
          className="absolute inset-y-0 right-0 rounded-r-pill transition-[width] duration-1000 ease-out"
          style={{
            width: `${100 - p}%`,
            background: `linear-gradient(90deg, ${VERMELHO}, #8c1d2a)`,
            opacity: ativo ? 1 : 0.35,
          }}
        />
        {/* O meio da corda: 50%. */}
        <span aria-hidden="true" className="absolute inset-y-[-4px] left-1/2 w-px bg-white/40" />
        <span
          aria-hidden="true"
          className="absolute top-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-navy-900 shadow-[0_0_0_4px_rgba(255,255,255,0.15),0_6px_16px_-4px_rgba(0,0,0,0.6)] transition-[left] duration-1000 ease-out"
          style={{ left: `${p}%` }}
        >
          <Zap className="size-3.5 fill-gold-400 text-gold-600" />
        </span>
      </div>
    </div>
  );
}

const textoDaSecao = (s: Pick<SecaoNoDuelo, 'zona' | 'secao'>) => `Seção ${s.secao ?? '?'} · Zona ${s.zona ?? '?'}`;

/** O que importa, em cartoes: secoes, a mais disputada, a virada, os Lideres. */
function Leituras({ duelo, lideres }: { duelo: ReturnType<typeof montarDuelo>; lideres: LiderNoRaioX[] }) {
  const cartoes: {
    icone: React.ReactNode;
    titulo: string;
    valor: React.ReactNode;
    texto: React.ReactNode;
    tom: string;
  }[] = [
    {
      icone: <Trophy className="size-4" />,
      titulo: 'Seções vencidas',
      valor: (
        <>
          <span style={{ color: AZUL }}>{duelo.vitorias.esquerda}</span>
          <span className="mx-1 text-ink-400">×</span>
          <span style={{ color: VERMELHO }}>{duelo.vitorias.direita}</span>
        </>
      ),
      texto: `de ${formatNumber(duelo.secoes.length)} seções${duelo.vitorias.empate ? ` · ${duelo.vitorias.empate} empatada${duelo.vitorias.empate === 1 ? '' : 's'}` : ''}`,
      tom: 'from-gold-50',
    },
    {
      icone: <Target className="size-4" />,
      titulo: 'A mais perto de virar',
      valor: duelo.maisDisputada ? `${formatNumber(1 - duelo.maisDisputada.saldo)} ${1 - duelo.maisDisputada.saldo === 1 ? 'voto' : 'votos'}` : '—',
      texto: duelo.maisDisputada
        ? `${textoDaSecao(duelo.maisDisputada)}: ${formatNumber(duelo.maisDisputada.totalEsquerda)} × ${formatNumber(duelo.maisDisputada.totalDireita)}`
        : 'Seu lado não perdeu nenhuma seção',
      tom: 'from-accent-50',
    },
    {
      icone: <Flame className="size-4" />,
      titulo: 'Para virar as perdidas',
      valor: duelo.paraVirar > 0 ? `${formatNumber(duelo.paraVirar)} votos` : 'Nada',
      texto:
        duelo.paraVirar > 0
          ? `faltaram nas ${formatNumber(duelo.vitorias.direita)} ${duelo.vitorias.direita === 1 ? 'seção perdida' : 'seções perdidas'}`
          : 'Seu lado venceu ou empatou todas as seções',
      tom: 'from-danger-50',
    },
    {
      icone: <Crown className="size-4" />,
      titulo: 'Maior vitória · maior derrota',
      valor: (
        <>
          <span style={{ color: AZUL }}>{duelo.maiorVitoria ? `+${formatNumber(duelo.maiorVitoria.saldo)}` : '—'}</span>
          <span className="mx-1 text-ink-400">/</span>
          <span style={{ color: VERMELHO }}>{duelo.maiorDerrota ? formatNumber(duelo.maiorDerrota.saldo) : '—'}</span>
        </>
      ),
      texto:
        [duelo.maiorVitoria ? `Seção ${duelo.maiorVitoria.secao ?? '?'}` : null, duelo.maiorDerrota ? `Seção ${duelo.maiorDerrota.secao ?? '?'}` : null]
          .filter(Boolean)
          .join(' · ') || 'Sem seção decidida',
      tom: 'from-ink-50',
    },
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <ul className="grid gap-3 sm:grid-cols-2">
        {cartoes.map((c, i) => (
          <li
            key={c.titulo}
            className={cn('cmd-cascata rounded-card border border-line bg-gradient-to-br to-surface p-3.5', c.tom)}
            style={{ '--cmd-atraso': `${i * 70}ms` } as CSSProperties}
          >
            <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wide text-ink-500 uppercase">
              <span className="text-ink-700">{c.icone}</span>
              {c.titulo}
            </p>
            <p className="mt-1 text-2xl leading-tight font-black text-ink-900 tabular-nums">{c.valor}</p>
            <p className="mt-0.5 text-xs text-ink-500">{c.texto}</p>
          </li>
        ))}
      </ul>
      <CartaoDosLideres duelo={duelo} lideres={lideres} />
    </div>
  );
}

/** Onde os Lideres selecionados tem gente: o duelo so nessas secoes. */
function CartaoDosLideres({ duelo, lideres }: { duelo: ReturnType<typeof montarDuelo>; lideres: LiderNoRaioX[] }) {
  const d = duelo.dosLideres;
  if (!d) {
    return (
      <div className="flex flex-col justify-center rounded-card border-2 border-dashed border-line bg-surface p-4 text-sm text-ink-500">
        <p className="flex items-center gap-2 font-semibold text-ink-700">
          <Users aria-hidden="true" className="size-4" /> Nenhum líder selecionado
        </p>
        <p className="mt-1 text-xs">Volte ao Raio-X e selecione um ou mais líderes: aqui aparece o duelo só nas seções onde a gente deles vota.</p>
      </div>
    );
  }
  const total = d.esquerda + d.direita;
  const p = total > 0 ? (d.esquerda / total) * 100 : 50;
  return (
    <section
      aria-label="Duelo nas seções dos líderes selecionados"
      className="cmd-cascata overflow-hidden rounded-card border border-gold-500/40 bg-gradient-to-br from-gold-50 to-surface p-4"
    >
      <p className="flex items-center gap-1.5 text-[0.6875rem] font-bold tracking-wide text-gold-700 uppercase">
        <Users aria-hidden="true" className="size-4" /> Onde os líderes selecionados têm gente
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {lideres.map((l) => (
          <li
            key={l.id}
            className="inline-flex max-w-full items-center gap-1 rounded-pill border border-gold-500/50 bg-surface py-0.5 pr-1.5 pl-0.5 text-[0.6875rem]"
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[0.5625rem] font-bold text-gold-400">
              {initials(l.nome)}
            </span>
            <span className="min-w-0 font-semibold wrap-break-word text-ink-900">{l.nome}</span>
            <SeloDaReferencia referencia={l.referencia} compacto />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-ink-700">
        <b className="text-ink-900 tabular-nums">{formatNumber(d.pessoas)}</b> {d.pessoas === 1 ? 'pessoa' : 'pessoas'} em{' '}
        <b className="text-ink-900 tabular-nums">{formatNumber(d.secoes)}</b> {d.secoes === 1 ? 'seção' : 'seções'}. Nelas:
      </p>
      <div className="mt-1.5 flex items-baseline gap-2 text-3xl font-black tabular-nums">
        <span style={{ color: AZUL }}>{formatNumber(d.esquerda)}</span>
        <span className="text-base font-bold text-ink-400">×</span>
        <span style={{ color: VERMELHO }}>{formatNumber(d.direita)}</span>
      </div>
      <div className="mt-2 flex h-2.5 overflow-hidden rounded-pill bg-ink-100">
        <span className="h-full transition-[width] duration-1000 ease-out" style={{ width: `${p}%`, background: AZUL }} />
        <span className="h-full flex-1" style={{ background: total > 0 ? VERMELHO : undefined }} />
      </div>
      <p className="mt-2 text-xs text-ink-500">
        Seu lado venceu <b className="text-ink-900">{d.vitorias}</b> e perdeu <b className="text-ink-900">{d.derrotas}</b> dessas seções.
        {d.pessoas > 0 && d.esquerda < d.pessoas
          ? ` A gente cadastrada (${formatNumber(d.pessoas)}) é maior que os votos do seu lado ali: ${formatNumber(d.pessoas - d.esquerda)} a buscar.`
          : ''}
      </p>
    </section>
  );
}

/**
 * Secao por secao, como borboleta: as barras do seu lado crescem para a
 * esquerda e as do adversario para a direita, a partir do meio, cada
 * candidato na cor dele. No meio, a secao, a gente do time e a dos Lideres.
 */
function SecaoPorSecao({
  secoes,
  esquerda,
  direita,
  filtro,
  onFiltro,
  comLideres,
}: {
  secoes: SecaoNoDuelo[];
  esquerda: CandidatoNoRaioX[];
  direita: CandidatoNoRaioX[];
  filtro: Filtro;
  onFiltro: (f: Filtro) => void;
  comLideres: boolean;
}) {
  const maior = Math.max(1, ...secoes.map((s) => Math.max(s.totalEsquerda, s.totalDireita)));
  const contagem: Record<Filtro, number> = {
    todas: secoes.length,
    ganhas: secoes.filter((s) => s.vencedor === 'ESQUERDA').length,
    perdidas: secoes.filter((s) => s.vencedor === 'DIREITA').length,
    empates: secoes.filter((s) => s.vencedor === 'EMPATE' || s.vencedor === 'SEM_VOTOS').length,
    lideres: secoes.filter((s) => s.dosLideres > 0).length,
  };
  const opcoes: [Filtro, string][] = [
    ['todas', 'Todas'],
    ['ganhas', 'Vencidas'],
    ['perdidas', 'Perdidas'],
    ['empates', 'Empates'],
    ...(comLideres ? ([['lideres', 'Com os líderes']] as [Filtro, string][]) : []),
  ];
  const visiveis = secoes.filter((s) =>
    filtro === 'ganhas'
      ? s.vencedor === 'ESQUERDA'
      : filtro === 'perdidas'
        ? s.vencedor === 'DIREITA'
        : filtro === 'empates'
          ? s.vencedor === 'EMPATE' || s.vencedor === 'SEM_VOTOS'
          : filtro === 'lideres'
            ? s.dosLideres > 0
            : true,
  );

  return (
    <section aria-label="Seção por seção" className="overflow-hidden rounded-card border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">Seção por seção</h3>
          <p className="text-xs text-ink-500">Seu lado cresce para a esquerda, os adversários para a direita</p>
        </div>
        <div role="group" aria-label="Quais seções" className="flex flex-wrap gap-1 rounded-[1.25rem] border border-line bg-ink-50 p-0.5">
          {opcoes.map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={filtro === valor}
              onClick={() => onFiltro(valor)}
              className={cn(
                'min-h-8 rounded-pill px-3 text-xs font-semibold transition-colors',
                filtro === valor ? 'bg-navy-900 text-white shadow-card' : 'text-ink-700 hover:text-ink-900',
              )}
            >
              {rotulo} <span className={cn('tabular-nums', filtro === valor ? 'text-gold-400' : 'text-ink-400')}>{contagem[valor]}</span>
            </button>
          ))}
        </div>
      </header>

      {visiveis.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-500">Nenhuma seção neste filtro.</p>
      ) : (
        <ol className="divide-y divide-line">
          {visiveis.map((s, i) => {
            const ganhou = s.vencedor === 'ESQUERDA';
            const perdeu = s.vencedor === 'DIREITA';
            return (
              <li
                key={s.chave}
                className={cn(
                  'cmd-cascata grid grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1fr)] items-center gap-1 px-2 sm:gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_11rem_minmax(0,1fr)] sm:px-4',
                  ganhou && 'bg-[#2a78d6]/[0.04]',
                  perdeu && 'bg-[#e5484d]/[0.05]',
                )}
                style={
                  {
                    '--cmd-atraso': `${Math.min(i, 16) * 25}ms`,
                  } as CSSProperties
                }
              >
                {/* Seu lado: da direita para a esquerda. */}
                <Barras candidatos={esquerda} votos={s.esquerda} total={s.totalEsquerda} maior={maior} venceu={ganhou} lado="esquerda" />

                <div className="flex flex-col items-center text-center">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[0.625rem] font-bold tracking-wide uppercase',
                      ganhou ? 'bg-[#2a78d6] text-white' : perdeu ? 'bg-[#e5484d] text-white' : 'bg-ink-100 text-ink-500',
                    )}
                  >
                    {ganhou ? (
                      <>
                        <Crown aria-hidden="true" className="size-3" /> venceu
                      </>
                    ) : perdeu ? (
                      'perdeu'
                    ) : s.vencedor === 'EMPATE' ? (
                      'empate'
                    ) : (
                      'sem votos'
                    )}
                  </span>
                  <span className="mt-1 text-sm font-bold text-ink-900 tabular-nums">Seção {s.secao ?? '?'}</span>
                  <span className="text-[0.625rem] text-ink-500">Zona {s.zona ?? '?'}</span>
                  <span className="mt-1 flex flex-wrap justify-center gap-1">
                    <span
                      className={cn(
                        'inline-flex items-center gap-0.5 rounded-pill px-1.5 text-[0.625rem] font-semibold tabular-nums',
                        s.estimativa > 0 ? 'bg-navy-900 text-white' : 'bg-ink-100 text-ink-400',
                      )}
                      title="Pessoas do time que votam nesta seção"
                    >
                      <Users aria-hidden="true" className="size-2.5" /> {formatNumber(s.estimativa)}
                    </span>
                    {s.dosLideres > 0 ? (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-pill bg-gold-400 px-1.5 text-[0.625rem] font-bold text-navy-900 tabular-nums"
                        title="Pessoas dos líderes selecionados nesta seção"
                      >
                        ★ {formatNumber(s.dosLideres)}
                      </span>
                    ) : null}
                  </span>
                  {perdeu ? (
                    <span className="mt-0.5 text-[0.625rem] font-semibold text-danger-700 tabular-nums">faltaram {formatNumber(1 - s.saldo)}</span>
                  ) : ganhou ? (
                    <span className="mt-0.5 text-[0.625rem] font-semibold text-accent-700 tabular-nums">+{formatNumber(s.saldo)}</span>
                  ) : null}
                </div>

                {/* Adversarios: da esquerda para a direita. */}
                <Barras candidatos={direita} votos={s.direita} total={s.totalDireita} maior={maior} venceu={perdeu} lado="direita" />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** As barras de um lado numa secao: um segmento por candidato, na cor dele, e o total na ponta. */
function Barras({
  candidatos,
  votos,
  total,
  maior,
  venceu,
  lado,
}: {
  candidatos: CandidatoNoRaioX[];
  votos: number[];
  total: number;
  maior: number;
  venceu: boolean;
  lado: 'esquerda' | 'direita';
}) {
  const esquerda = lado === 'esquerda';
  // O total vai colado na ponta da barra; a barra cheia deixa espaco para ele.
  const fracao = total > 0 ? Math.max(0.02, total / maior) : 0;
  return (
    <div className={cn('flex min-w-0 items-center', esquerda && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-5 min-w-0 overflow-hidden transition-[width] duration-700 ease-out',
          esquerda ? 'flex-row-reverse rounded-l-md' : 'rounded-r-md',
          !venceu && 'opacity-60',
        )}
        style={{ width: `calc((100% - 2.5rem) * ${fracao})` }}
      >
        {candidatos.map((c, k) =>
          (votos[k] ?? 0) > 0 ? (
            <span
              key={c.id ?? c.rotulo}
              className="h-full border-white/40 first:border-0"
              style={{
                width: `${((votos[k] ?? 0) / Math.max(1, total)) * 100}%`,
                background: c.cor,
                [esquerda ? 'borderRightWidth' : 'borderLeftWidth']: 1,
              }}
              title={`${c.nome}: ${formatNumber(votos[k] ?? 0)}`}
            />
          ) : null,
        )}
      </div>
      <span
        className={cn('min-w-10 shrink-0 px-1.5 text-sm font-bold tabular-nums', esquerda ? 'text-right' : 'text-left', venceu ? 'text-ink-900' : 'text-ink-400')}
      >
        {formatNumber(total)}
      </span>
    </div>
  );
}

/** Todos os candidatos da sala, do mais votado na escola para o menos, com o lado de cada um. */
function Ranking({
  esquerda,
  votosEsquerda,
  direita,
  votosDireita,
}: {
  esquerda: CandidatoNoRaioX[];
  votosEsquerda: number[];
  direita: CandidatoNoRaioX[];
  votosDireita: number[];
}) {
  const todos = [
    ...esquerda.map((c, i) => ({
      c,
      v: votosEsquerda[i] ?? 0,
      lado: 'esquerda' as const,
    })),
    ...direita.map((c, i) => ({
      c,
      v: votosDireita[i] ?? 0,
      lado: 'direita' as const,
    })),
  ].sort((a, b) => b.v - a.v);
  const maior = Math.max(1, todos[0]?.v ?? 1);
  return (
    <section aria-label="Ranking da escola" className="rounded-card border border-line bg-surface">
      <header className="border-b border-line px-4 py-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
          <Trophy aria-hidden="true" className="size-4 text-gold-600" /> Ranking da escola
        </h3>
      </header>
      <ol className="divide-y divide-line">
        {todos.map(({ c, v, lado }, i) => (
          <li key={c.id ?? c.rotulo} className="grid grid-cols-[1.75rem_auto_minmax(0,1fr)_4rem] items-center gap-3 px-4 py-2">
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full text-[0.6875rem] font-bold',
                i === 0 ? 'bg-gold-400 text-navy-900' : 'bg-ink-100 text-ink-700',
              )}
            >
              {i === 0 ? <Crown aria-hidden="true" className="size-3.5" /> : i + 1}
            </span>
            <FotoDoCandidato cargo={c.cargo} sqcand={null} src={c.foto} nome={c.nome} tamanho="sm" />
            <span className="min-w-0">
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold wrap-break-word text-ink-900">{c.nome}</span>
                <span
                  className="rounded-pill px-1.5 py-px text-[0.5625rem] font-bold tracking-wide text-white uppercase"
                  style={{ background: lado === 'esquerda' ? AZUL : VERMELHO }}
                >
                  {lado === 'esquerda' ? 'seu lado' : 'adversário'}
                </span>
              </span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-pill bg-ink-100">
                <span
                  className="block h-full rounded-pill transition-[width] duration-1000 ease-out"
                  style={{
                    width: `${Math.max(v > 0 ? 3 : 0, (v / maior) * 100)}%`,
                    background: c.cor,
                  }}
                />
              </span>
            </span>
            <span className="text-right text-base font-bold text-ink-900 tabular-nums">{formatNumber(v)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------------------------------------------------------------------- */

/**
 * O seletor de adversarios: uma gaveta pela direita, com busca, turno e
 * cargo. Os da esquerda nao aparecem; os ja chamados ficam marcados (tocar
 * de novo tira do confronto).
 */
function Seletor({
  lista,
  base,
  carregando,
  erro,
  naEsquerda,
  naDireita,
  onAdicionar,
  onRemover,
  onClose,
}: {
  lista: CandidatoDaVotacao[];
  base: CandidatoDaVotacao | null;
  carregando: boolean;
  erro: boolean;
  naEsquerda: ReadonlySet<string | undefined>;
  naDireita: ReadonlySet<string>;
  onAdicionar: (c: CandidatoDaVotacao) => void;
  onRemover: (id: string) => void;
  onClose: () => void;
}) {
  const turnos = useMemo(() => [...new Set(lista.map((c) => c.turno))].sort((a, b) => a - b), [lista]);
  const [turno, setTurno] = useState<number | null>(base?.turno ?? null);
  const turnoAtivo = turno ?? turnos[turnos.length - 1] ?? null;
  const cargos = useMemo(() => cargosDaVotacao(lista.filter((c) => turnoAtivo === null || c.turno === turnoAtivo)), [lista, turnoAtivo]);
  const [cargo, setCargo] = useState<number | null>(base?.cargoCodigo ?? null);
  const [busca, setBusca] = useState('');
  const [quantos, setQuantos] = useState(LEVA);
  const achados = useMemo(
    () =>
      filtrarCandidatos(lista, {
        turno: turnoAtivo,
        cargoCodigo: cargo,
        busca,
      }).filter((c) => !naEsquerda.has(c.id)),
    [lista, turnoAtivo, cargo, busca, naEsquerda],
  );
  const maior = Math.max(1, achados[0]?.total ?? 1);

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button type="button" aria-label="Fechar a escolha" onClick={onClose} className="absolute inset-0 animate-fade-in bg-navy-900/60 backdrop-blur-[2px]" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Escolher adversários"
        className="relative flex h-full w-full max-w-lg animate-[slide-right_320ms_cubic-bezier(0.22,1,0.36,1)] flex-col bg-surface shadow-overlay"
      >
        <header className="shrink-0 border-b border-line bg-gradient-to-r from-[#4a0d16] to-navy-900 px-4 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-[0.6875rem] font-bold tracking-[0.16em] text-[#ff8a8e] uppercase">
                <Swords aria-hidden="true" className="size-3.5" /> Lado direito
              </p>
              <h3 className="mt-0.5 text-lg font-bold">Quem vai para o confronto?</h3>
              <p className="text-xs text-white/65">
                {naDireita.size ? `${naDireita.size} ${naDireita.size === 1 ? 'adversário escolhido' : 'adversários escolhidos'} · ` : ''}
                toque para chamar ou tirar
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-pill bg-white px-4 text-sm font-bold text-navy-900 shadow-card transition-transform hover:-translate-y-0.5"
            >
              <Check aria-hidden="true" className="size-4" strokeWidth={3} /> Pronto
            </button>
          </div>
          <label className="relative mt-3 flex items-center">
            <span className="sr-only">Buscar candidato</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-ink-400" />
            <input
              type="search"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setQuantos(LEVA);
              }}
              placeholder="Nome ou número"
              autoFocus
              className="min-h-11 w-full rounded-pill border border-white/20 bg-white pr-3 pl-9 text-sm text-ink-900 placeholder:text-ink-400 focus:ring-4 focus:ring-[#e5484d]/30 focus:outline-none"
            />
          </label>
        </header>

        <div className="shrink-0 space-y-2 border-b border-line px-4 py-3">
          {turnos.length > 1 ? (
            <div role="group" aria-label="Turno" className="flex gap-1">
              {turnos.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={turnoAtivo === t}
                  onClick={() => {
                    setTurno(t);
                    setQuantos(LEVA);
                  }}
                  className={cn(
                    'min-h-8 rounded-pill px-3 text-xs font-semibold transition-colors',
                    turnoAtivo === t ? 'bg-navy-900 text-white' : 'border border-line text-ink-700 hover:bg-ink-50',
                  )}
                >
                  {t}º turno
                </button>
              ))}
            </div>
          ) : null}
          <div role="group" aria-label="Cargo" className="scrollbar-slim flex gap-1 overflow-x-auto pb-1">
            {[{ codigo: null as number | null, nome: 'Todos os cargos' }, ...cargos].map((c) => (
              <button
                key={c.codigo ?? 'todos'}
                type="button"
                aria-pressed={cargo === c.codigo}
                onClick={() => {
                  setCargo(c.codigo);
                  setQuantos(LEVA);
                }}
                className={cn(
                  'min-h-8 shrink-0 rounded-pill px-3 text-xs font-semibold whitespace-nowrap transition-colors',
                  cargo === c.codigo ? 'bg-[#e5484d] text-white' : 'border border-line text-ink-700 hover:bg-ink-50',
                )}
              >
                {c.nome}
              </button>
            ))}
          </div>
        </div>

        <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto">
          {carregando ? (
            <p className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-ink-500">
              <Spinner className="size-4" /> Carregando os candidatos…
            </p>
          ) : erro ? (
            <p className="px-4 py-10 text-center text-sm text-danger-700">Não foi possível carregar os candidatos.</p>
          ) : achados.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-500">Nenhum candidato com esse filtro.</p>
          ) : (
            <ul className="divide-y divide-line">
              {achados.slice(0, quantos).map((c) => {
                const dentro = naDireita.has(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      aria-pressed={dentro}
                      onClick={() => (dentro ? onRemover(c.id) : onAdicionar(c))}
                      className={cn(
                        'flex w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left transition-colors',
                        dentro ? 'bg-[#e5484d]/[0.07]' : 'hover:bg-ink-50',
                      )}
                    >
                      <FotoDoCandidato cargo={c.cargoCodigo} sqcand={c.sqcand ?? null} src={fotoDoCandidatoUrl(c)} nome={c.nome} tamanho="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold wrap-break-word text-ink-900">
                          {c.nome} <span className="font-normal text-ink-500 tabular-nums">({c.numero})</span>
                        </span>
                        <span className="block text-[0.6875rem] text-ink-500">{c.cargo}</span>
                        <span className="mt-1 block h-1 overflow-hidden rounded-pill bg-ink-100">
                          <span
                            className="block h-full rounded-pill bg-[#e5484d]/70"
                            style={{
                              width: `${Math.max(2, (c.total / maior) * 100)}%`,
                            }}
                          />
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-bold text-ink-900 tabular-nums">{formatNumber(c.total)}</span>
                        <span className="block text-[0.625rem] text-ink-500">votos</span>
                      </span>
                      <span
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-full transition-all',
                          dentro ? 'bg-[#e5484d] text-white' : 'border border-line text-ink-500',
                        )}
                      >
                        {dentro ? <Check aria-hidden="true" className="size-4" strokeWidth={3} /> : <Plus aria-hidden="true" className="size-4" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {achados.length > quantos ? (
            <div className="p-4">
              <button
                type="button"
                onClick={() => setQuantos((q) => q + LEVA)}
                className="min-h-10 w-full rounded-pill border border-line text-sm font-semibold text-ink-700 hover:bg-ink-50"
              >
                Mostrar mais ({formatNumber(achados.length - quantos)})
              </button>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
