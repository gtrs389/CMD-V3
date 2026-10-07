'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { AlertTriangle, Check, Crown, Flame, Plus, Search, Swords, Target, Trophy, Users, X, Zap } from 'lucide-react';
import type { LiderNoRaioX } from '@/lib/domain/confronto';
import type { Duelo, SecaoNoDuelo } from '@/lib/domain/sala-de-confronto';
import { cargosDaVotacao, filtrarCandidatos, fotoDoCandidatoUrl, type CandidatoDaVotacao } from '@/lib/domain/votacao-tse';
import { FotoDoCandidato } from '@/components/apuracao/FotoDoCandidato';
import { Contador } from '@/components/ui/Contador';
import { Spinner } from '@/components/ui/Spinner';
import { SeloDaReferencia } from '@/components/members/TagDaReferencia';
import { cn } from '@/lib/utils/cn';
import { formatNumber, initials } from '@/lib/utils/text';
import type { CandidatoNoRaioX } from '@/components/dashboard/votacao/RaioXDaEscola';
import { MarcaDaBarra } from '@/components/dashboard/votacao/MarcaDaBarra';

/**
 * As pecas da arena da Sala de Confronto: os dois lados, o placar do meio,
 * o cabo de guerra, as leituras, secao por secao em borboleta, o ranking e
 * a gaveta dos adversarios. Do lado ESQUERDO (azul), os candidatos que
 * vieram do mapa; do DIREITO (vermelho), os adversarios chamados na sala.
 */

/** As cores dos dois lados: azul (o nosso) e vermelho (o adversario). */
export const AZUL = '#2a78d6';
export const VERMELHO = '#e5484d';

/** Quantos nomes a lista do seletor mostra de cada vez. */
const LEVA = 50;

export type Filtro = 'todas' | 'ganhas' | 'perdidas' | 'empates' | 'lideres';


export interface Lutador extends CandidatoNoRaioX {
  /** Ainda chegando (a votacao do adversario e buscada ao entrar). */
  carregando?: boolean;
  erro?: boolean;
}


/** Um lado da arena: os candidatos com foto, votos na escola e a parte de cada um. */
export function Lado({
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
  rotuloDeAdicionar = 'Adicionar adversário',
}: {
  /** O texto do botao de adicionar. */
  rotuloDeAdicionar?: string;
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
                <Plus aria-hidden="true" className="size-4" /> {rotuloDeAdicionar}
              </button>
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

/** O lado direito vazio: a chamada e as sugestoes (os mais votados do mesmo cargo). */
export function ChamadaDoAdversario({
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
export function Centro({
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
export function CaboDeGuerra({ parte, ativo }: { parte: number; ativo: boolean }) {
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
export function Leituras({ duelo, lideres }: { duelo: Duelo; lideres: LiderNoRaioX[] }) {
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
export function CartaoDosLideres({ duelo, lideres }: { duelo: Duelo; lideres: LiderNoRaioX[] }) {
  const d = duelo.dosLideres;
  if (!d) {
    return (
      <div className="flex flex-col justify-center rounded-card border-2 border-dashed border-line bg-surface p-4 text-sm text-ink-500">
        <p className="flex items-center gap-2 font-semibold text-ink-700">
          <Users aria-hidden="true" className="size-4" /> Nenhum líder selecionado
        </p>
        <p className="mt-1 text-xs">Marque um ou mais líderes no placar dos líderes, logo abaixo: aqui aparece o duelo só nas seções onde a gente deles vota.</p>
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
 * Secao por secao, no mesmo desenho do Raio-X da escola: a barra da gente
 * do time (com a parte dos Lideres marcados em ouro), uma barra por
 * candidato com a foto dele no comeco — o seu lado e, depois do traco, os
 * adversarios —, todas na mesma escala, e embaixo quem cadastrou a gente
 * daquela secao, com a referencia. Do lado, quem levou a secao e por quanto.
 */
export function SecaoPorSecao({
  secoes,
  esquerda,
  direita,
  filtro,
  onFiltro,
  comLideres,
  lideres = [],
  selecionados,
  zona,
  onZona,
  semAdversario = false,
}: {
  secoes: SecaoNoDuelo[];
  esquerda: CandidatoNoRaioX[];
  direita: CandidatoNoRaioX[];
  filtro: Filtro;
  onFiltro: (f: Filtro) => void;
  comLideres: boolean;
  /** Todos os Lideres da escola: cada secao mostra quem cadastrou ali. */
  lideres?: LiderNoRaioX[];
  /** Os Lideres selecionados (ficam em ouro). */
  selecionados?: ReadonlySet<string>;
  /** A zona escolhida (nula: todas), controlada de fora (os cartoes das zonas tambem escolhem). */
  zona: string | null;
  onZona: (zona: string | null) => void;
  /** Ainda sem adversario: so os votos do seu lado contra a gente do time, sem vencedor. */
  semAdversario?: boolean;
}) {
  const zonas = [...new Set(secoes.map((s) => s.zona ?? '?'))];
  const setZona = onZona;
  const daZona = zona ? secoes.filter((s) => (s.zona ?? '?') === zona) : secoes;
  const maior = Math.max(1, ...secoes.map((s) => Math.max(s.estimativa, ...s.esquerda, ...s.direita)));
  const largura = (v: number) => `${v > 0 ? Math.max(2, (v / maior) * 100) : 0}%`;
  const contagem: Record<Filtro, number> = {
    todas: daZona.length,
    ganhas: daZona.filter((s) => s.vencedor === 'ESQUERDA').length,
    perdidas: daZona.filter((s) => s.vencedor === 'DIREITA').length,
    empates: daZona.filter((s) => s.vencedor === 'EMPATE' || s.vencedor === 'SEM_VOTOS').length,
    lideres: daZona.filter((s) => s.dosLideres > 0).length,
  };
  const opcoes: [Filtro, string][] = [
    ['todas', 'Todas'],
    ...(semAdversario
      ? []
      : ([
          ['ganhas', 'Vencidas'],
          ['perdidas', 'Perdidas'],
          ['empates', 'Empates'],
        ] as [Filtro, string][])),
    ...(comLideres ? ([['lideres', 'Com os líderes']] as [Filtro, string][]) : []),
  ];
  const visiveis = daZona.filter((s) =>
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
          <p className="text-xs text-ink-500">
            {semAdversario
              ? 'Os votos do seu lado em cada seção, com a gente do time e quem cadastrou'
              : 'A gente do time, o seu lado e os adversários, seção por seção, com quem cadastrou'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {zonas.length > 1 ? (
          <div role="group" aria-label="Zona" className="flex flex-wrap gap-1 rounded-[1.25rem] border border-line bg-ink-50 p-0.5">
            {[null, ...zonas].map((z) => (
              <button
                key={z ?? 'todas'}
                type="button"
                aria-pressed={zona === z}
                onClick={() => setZona(z)}
                className={cn(
                  'min-h-8 rounded-pill px-3 text-xs font-semibold transition-colors',
                  zona === z ? 'bg-gold-400 text-navy-900 shadow-card' : 'text-ink-700 hover:text-ink-900',
                )}
              >
                {z === null ? 'Todas as zonas' : `Zona ${z}`}
              </button>
            ))}
          </div>
        ) : null}
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
        </div>
      </header>

      {visiveis.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-500">Nenhuma seção neste filtro.</p>
      ) : (
        <ol className="divide-y divide-line">
          {visiveis.map((s, i) => {
            const ganhou = !semAdversario && s.vencedor === 'ESQUERDA';
            const perdeu = !semAdversario && s.vencedor === 'DIREITA';
            const semGente = s.estimativa <= 0;
            return (
              <li
                key={s.chave}
                className={cn(
                  'cmd-cascata grid grid-cols-[5.75rem_minmax(0,1fr)] items-start gap-3 px-4 py-3',
                  ganhou && 'bg-[#2a78d6]/[0.035]',
                  perdeu && 'bg-[#e5484d]/[0.045]',
                )}
                style={{ '--cmd-atraso': `${Math.min(i, 16) * 25}ms` } as CSSProperties}
              >
                {/* A secao e o resultado dela. */}
                <div className="min-w-0 pt-1">
                  <p className="text-sm font-semibold text-ink-900 tabular-nums">Seção {s.secao ?? '?'}</p>
                  <p className="text-[0.6875rem] text-ink-500">Zona {s.zona ?? '?'}</p>
                  {semAdversario ? null : (
                    <span
                      className={cn(
                        'mt-1.5 inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[0.625rem] font-bold tracking-wide uppercase',
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
                  )}
                  {semAdversario ? null : (
                    <p className="mt-1 text-[0.6875rem] font-bold tabular-nums">
                      <span style={{ color: AZUL }}>{formatNumber(s.totalEsquerda)}</span>
                      <span className="text-ink-400"> × </span>
                      <span style={{ color: VERMELHO }}>{formatNumber(s.totalDireita)}</span>
                    </p>
                  )}
                  {perdeu ? (
                    <p className="text-[0.625rem] font-semibold text-danger-700 tabular-nums">faltaram {formatNumber(1 - s.saldo)}</p>
                  ) : ganhou ? (
                    <p className="text-[0.625rem] font-semibold text-accent-700 tabular-nums">+{formatNumber(s.saldo)}</p>
                  ) : null}
                  {semGente ? (
                    <p className="mt-1 inline-flex rounded-pill bg-ink-200 px-1.5 py-0.5 text-[0.5625rem] font-semibold tracking-wide whitespace-nowrap text-ink-500 uppercase">
                      sem gente
                    </p>
                  ) : null}
                </div>

                <div className="min-w-0 space-y-1">
                  {/* A gente do time: com Lideres marcados, a parte deles em ouro escuro. */}
                  <div className={cn('flex items-center gap-2', semGente && 'opacity-50')} title={`Estimativa do time: ${formatNumber(s.estimativa)}`}>
                    <MarcaDaBarra />
                    <div className="flex h-2.5 flex-1 overflow-hidden rounded-pill bg-ink-100">
                      <div className="flex h-full overflow-hidden rounded-pill transition-[width] duration-700 ease-out" style={{ width: largura(s.estimativa) }}>
                        {s.dosLideres > 0 ? (
                          <div className="h-full bg-gold-600" style={{ width: `${(s.dosLideres / Math.max(1, s.estimativa)) * 100}%` }} />
                        ) : null}
                        <div className={cn('h-full flex-1', s.dosLideres > 0 ? 'bg-navy-300' : 'bg-navy-800')} />
                      </div>
                    </div>
                    <span className="w-14 text-right text-xs font-semibold text-ink-900 tabular-nums">
                      {s.dosLideres > 0 ? (
                        <>
                          <span className="text-gold-700">{formatNumber(s.dosLideres)}</span>
                          <span className="font-normal text-ink-400">/{formatNumber(s.estimativa)}</span>
                        </>
                      ) : (
                        formatNumber(s.estimativa)
                      )}
                    </span>
                  </div>
                  {/* O seu lado. */}
                  {esquerda.map((c, k) => (
                    <BarraDoCandidato key={c.id ?? c.rotulo} candidato={c} votos={s.esquerda[k] ?? 0} largura={largura(s.esquerda[k] ?? 0)} />
                  ))}
                  {/* Os adversarios, depois do traco vermelho. */}
                  {direita.length ? (
                    <>
                      <div className="flex items-center gap-2 py-0.5" aria-hidden="true">
                        <span className="h-px flex-1 bg-[#e5484d]/30" />
                        <span className="text-[0.5625rem] font-bold tracking-[0.14em] text-[#e5484d] uppercase">× adversários</span>
                        <span className="h-px flex-1 bg-[#e5484d]/30" />
                      </div>
                      {direita.map((c, k) => (
                        <BarraDoCandidato key={c.id ?? c.rotulo} candidato={c} votos={s.direita[k] ?? 0} largura={largura(s.direita[k] ?? 0)} />
                      ))}
                    </>
                  ) : null}
                  {/* Quem cadastrou a gente desta secao, com a referencia de cada um. */}
                  <LideresDaSecao lideres={lideres} chave={s.chave} estimativa={s.estimativa} selecionados={selecionados} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** A barra de um candidato numa secao: a foto no comeco, a cor dele e os votos na ponta. */
function BarraDoCandidato({ candidato: c, votos, largura }: { candidato: CandidatoNoRaioX; votos: number; largura: string }) {
  return (
    <div className="flex items-center gap-2" title={`${c.nome}: ${formatNumber(votos)}`}>
      <MarcaDaBarra candidato={c} />
      <div className="h-2.5 flex-1 overflow-hidden rounded-pill bg-ink-100">
        <div className="h-full rounded-pill transition-[width] duration-700 ease-out" style={{ width: largura, background: c.cor }} />
      </div>
      <span className="w-14 text-right text-xs font-semibold text-ink-900 tabular-nums">{formatNumber(votos)}</span>
    </div>
  );
}

/** Os Lideres de uma secao, do que mais cadastrou ali para o que menos. */
function LideresDaSecao({
  lideres,
  chave,
  estimativa,
  selecionados,
}: {
  lideres: LiderNoRaioX[];
  chave: string;
  estimativa: number;
  selecionados?: ReadonlySet<string>;
}) {
  const daSecao = lideres
    .map((l) => ({ l, n: l.porSecao[chave] ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.l.nome.localeCompare(b.l.nome, 'pt-BR'));
  const semLider = Math.max(0, estimativa - daSecao.reduce((t, x) => t + x.n, 0));
  if (daSecao.length === 0 && semLider === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1 pt-1" aria-label="Quem cadastrou nesta seção">
      {daSecao.map(({ l, n }) => {
        const ativo = selecionados?.has(l.id);
        return (
          <li
            key={l.id}
            className={cn(
              'inline-flex max-w-full items-center gap-1 rounded-pill border py-0.5 pr-1 pl-0.5 text-[0.6875rem]',
              ativo ? 'border-gold-500 bg-gold-50' : 'border-line bg-surface',
            )}
            title={`${l.nome}: ${n} ${n === 1 ? 'pessoa cadastrada' : 'pessoas cadastradas'} nesta seção`}
          >
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full text-[0.5625rem] font-bold',
                ativo ? 'bg-gold-500 text-navy-900' : 'bg-navy-900 text-gold-400',
              )}
            >
              {initials(l.nome)}
            </span>
            <span className="min-w-0 font-semibold wrap-break-word text-ink-900">{l.nome}</span>
            <SeloDaReferencia referencia={l.referencia} compacto />
            <span className="rounded-pill bg-navy-900 px-1.5 text-[0.625rem] font-bold text-white tabular-nums">{n}</span>
          </li>
        );
      })}
      {semLider > 0 ? (
        <li className="inline-flex items-center gap-1 rounded-pill border border-dashed border-ink-200 px-2 py-0.5 text-[0.6875rem] text-ink-500">
          sem líder <b className="tabular-nums">{semLider}</b>
        </li>
      ) : null}
    </ul>
  );
}

/** Todos os candidatos da sala, do mais votado na escola para o menos, com o lado de cada um. */
export function Ranking({
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
export function Seletor({
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
  // Abre com TODOS os cargos: o candidato que quiser, de qualquer cargo.
  const [cargo, setCargo] = useState<number | null>(null);
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
