'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { BarChart3, BookmarkCheck, BookmarkX, ChevronDown, ChevronsDownUp, ChevronsUpDown, UserRound, Users } from 'lucide-react';
import type { Member } from '@/lib/types';
import { equipePorReferencia, type GrupoDaReferencia } from '@/lib/domain/equipe-por-referencia';
import { SEM_REFERENCIA } from '@/lib/domain/filtros-da-equipe';
import { corDoCandidato } from '@/components/dashboard/votacao/cores';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/text';
import { TagDoLider } from './TagDoLider';

/** Vermelho de "Sem referência": o mesmo da tag. */
const VERMELHO = '#b42318';
/** Pessoas da Equipe que aparecem de cara em cada Lider; o resto num toque. */
const EQUIPE_DE_CARA = 12;

/**
 * "Por referência": o time agrupado pela referencia dos Lideres.
 *
 * Em cima, a parte de cada referencia no time numa barra so (tocar leva ao
 * grupo). Embaixo, um cartao por referencia — Lideres, Equipe, quanto do
 * time — que abre os Lideres dela, cada um com a Equipe dele. A Equipe
 * herda a referencia do Lider. Busca e filtros da lista continuam valendo.
 */
export function EquipePorReferencia({
  pessoas,
  time,
  onAbrirPessoa,
  onAbrirLider,
}: {
  /** O recorte da lista (busca e filtros). */
  pessoas: Member[];
  /** O time inteiro: de onde se acha o Lider de cada pessoa. */
  time: Member[];
  onAbrirPessoa: (m: Member) => void;
  onAbrirLider: (m: Member) => void;
}) {
  const grupos = useMemo(() => equipePorReferencia(pessoas, time), [pessoas, time]);
  const totalGeral = Math.max(1, grupos.reduce((t, g) => t + g.total, 0));
  const totalDeLideres = grupos.reduce((t, g) => t + g.totalDeLideres, 0);
  const maior = Math.max(1, ...grupos.map((g) => g.total));
  // Com poucas referencias, todas abertas; com muitas, so a maior.
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(grupos.length <= 3 ? grupos.map((g) => g.chave) : grupos.slice(0, 1).map((g) => g.chave)));
  const cor = (g: GrupoDaReferencia, i: number) => (g.chave === SEM_REFERENCIA ? VERMELHO : corDoCandidato(i));
  const alternar = (chave: string) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  const irPara = (chave: string) => {
    setAbertos((atual) => new Set(atual).add(chave));
    window.setTimeout(() => document.getElementById(`ref-${chave}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const todasAbertas = grupos.every((g) => abertos.has(g.chave));

  if (grupos.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* A FOTO DO TIME: a parte de cada referencia, numa barra so. */}
      <section aria-label="O time por referência" className="overflow-hidden rounded-card bg-gradient-to-br from-navy-900 via-navy-800 to-[#1e3a8a] p-4 text-white shadow-card sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[0.625rem] font-bold tracking-[0.16em] text-gold-400 uppercase">O time por referência</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {formatNumber(grupos.filter((g) => g.chave !== SEM_REFERENCIA).length)}{' '}
              <span className="text-sm font-medium text-white/70">
                {grupos.filter((g) => g.chave !== SEM_REFERENCIA).length === 1 ? 'referência' : 'referências'} ·{' '}
                {formatNumber(totalDeLideres)} {totalDeLideres === 1 ? 'líder' : 'líderes'} · {formatNumber(totalGeral)}{' '}
                {totalGeral === 1 ? 'pessoa' : 'pessoas'}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAbertos(todasAbertas ? new Set() : new Set(grupos.map((g) => g.chave)))}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-white/20 bg-white/10 px-3 text-xs font-semibold transition-colors hover:bg-white/20"
          >
            {todasAbertas ? <ChevronsDownUp aria-hidden="true" className="size-4" /> : <ChevronsUpDown aria-hidden="true" className="size-4" />}
            {todasAbertas ? 'Fechar todas' : 'Abrir todas'}
          </button>
        </div>
        <div className="mt-4 flex h-4 overflow-hidden rounded-pill bg-white/10" aria-hidden="true">
          {grupos.map((g, i) => (
            <button
              key={g.chave}
              type="button"
              tabIndex={-1}
              onClick={() => irPara(g.chave)}
              title={`${g.rotulo}: ${formatNumber(g.total)} pessoas`}
              className="h-full transition-[filter] hover:brightness-125"
              style={{ flex: `${g.total} 0 0`, background: cor(g, i), boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.35)' }}
            />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {grupos.map((g, i) => (
            <li key={g.chave}>
              <button
                type="button"
                onClick={() => irPara(g.chave)}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-pill border border-white/15 bg-white/5 px-2.5 text-xs font-semibold transition-colors hover:bg-white/15"
              >
                <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: cor(g, i) }} />
                {g.rotulo}
                <span className="text-white/60 tabular-nums">{Math.round((g.total / totalGeral) * 100)}%</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* UM CARTAO POR REFERENCIA */}
      {grupos.map((g, i) => {
        const aberto = abertos.has(g.chave);
        const c = cor(g, i);
        const sem = g.chave === SEM_REFERENCIA;
        return (
          <section
            key={g.chave}
            id={`ref-${g.chave}`}
            aria-label={`Referência ${g.rotulo}`}
            className="cmd-cascata scroll-mt-4 overflow-hidden rounded-card border bg-surface shadow-card"
            style={{ borderColor: `${c}55`, '--cmd-atraso': `${Math.min(i, 10) * 40}ms` } as CSSProperties}
          >
            <button
              type="button"
              onClick={() => alternar(g.chave)}
              aria-expanded={aberto}
              className="group relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 text-left transition-colors hover:bg-ink-50/60 sm:px-5"
            >
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: c }} />
              <span className="flex size-11 items-center justify-center rounded-2xl text-white shadow-card" style={{ background: c }}>
                {sem ? <BookmarkX aria-hidden="true" className="size-5" /> : <BookmarkCheck aria-hidden="true" className="size-5" />}
              </span>
              <span className="min-w-0">
                <span className={cn('block text-base leading-tight font-bold wrap-break-word', sem ? 'text-danger-700' : 'text-ink-900')}>{g.rotulo}</span>
                <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-500">
                  <span className="inline-flex items-center gap-1">
                    <UserRound aria-hidden="true" className="size-3.5" />
                    <b className="text-ink-900 tabular-nums">{formatNumber(g.totalDeLideres)}</b> {g.totalDeLideres === 1 ? 'líder' : 'líderes'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users aria-hidden="true" className="size-3.5" />
                    <b className="text-ink-900 tabular-nums">{formatNumber(g.totalDaEquipe)}</b> {g.totalDaEquipe === 1 ? 'liderado' : 'liderados'}
                  </span>
                </span>
                <span className="mt-2 block h-2 overflow-hidden rounded-pill bg-ink-100">
                  <span className="cmd-barra-viva block h-full rounded-pill" style={{ width: `${Math.max(3, (g.total / maior) * 100)}%`, background: c }} />
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-right tabular-nums">
                  <span className="block text-2xl leading-none font-bold text-ink-900">{formatNumber(g.total)}</span>
                  <span className="block text-[0.6875rem] text-ink-500">{Math.round((g.total / totalGeral) * 100)}% do time</span>
                </span>
                <ChevronDown aria-hidden="true" className={cn('size-5 text-ink-400 transition-transform duration-300', aberto && 'rotate-180')} />
              </span>
            </button>

            {aberto ? (
              <ul className="animate-fade-in divide-y divide-line border-t border-line">
                {g.lideres.map((l) => (
                  <LinhaDoLider key={l.lider?.id ?? 'orfaos'} linha={l} cor={c} maior={Math.max(1, ...g.lideres.map((x) => x.equipe.length))} onAbrirPessoa={onAbrirPessoa} onAbrirLider={onAbrirLider} />
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function LinhaDoLider({
  linha,
  cor,
  maior,
  onAbrirPessoa,
  onAbrirLider,
}: {
  linha: GrupoDaReferencia['lideres'][number];
  cor: string;
  maior: number;
  onAbrirPessoa: (m: Member) => void;
  onAbrirLider: (m: Member) => void;
}) {
  const [toda, setToda] = useState(false);
  const { lider, equipe } = linha;
  const visiveis = toda ? equipe : equipe.slice(0, EQUIPE_DE_CARA);
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-3">
        {lider ? (
          <button type="button" onClick={() => onAbrirLider(lider)} className="group flex min-w-0 flex-1 items-center gap-3 text-left" title="Abrir o painel do Líder">
            <Avatar name={lider.name} src={lider.photo} size="md" />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold wrap-break-word text-ink-900 group-hover:text-brand-700 group-hover:underline">{lider.name}</span>
                <TagDoLider member={lider} />
                {!linha.liderNoRecorte ? <span className="rounded-pill bg-ink-100 px-1.5 py-0.5 text-[0.625rem] font-semibold text-ink-500">fora do filtro</span> : null}
              </span>
              <span className="mt-1.5 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-ink-100">
                  <span className="block h-full rounded-pill" style={{ width: `${equipe.length ? Math.max(4, (equipe.length / maior) * 100) : 0}%`, background: cor }} />
                </span>
              </span>
            </span>
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full border-2 border-dashed border-ink-200 text-ink-400">
              <Users aria-hidden="true" className="size-5" />
            </span>
            <span className="text-sm text-ink-500">Equipe sem Líder identificado no time</span>
          </span>
        )}
        <span className="flex items-center gap-2">
          <span className="text-right tabular-nums">
            <span className="block text-lg leading-none font-bold text-ink-900">{formatNumber(equipe.length)}</span>
            <span className="block text-[0.6875rem] text-ink-500">{equipe.length === 1 ? 'liderado' : 'liderados'}</span>
          </span>
          {lider ? (
            <button
              type="button"
              onClick={() => onAbrirLider(lider)}
              aria-label={`Painel do Líder ${lider.name}`}
              title="Painel do Líder"
              className="flex size-9 items-center justify-center rounded-full border border-line text-ink-500 transition-colors hover:border-brand-700 hover:text-brand-700"
            >
              <BarChart3 aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </span>
      </div>

      {equipe.length ? (
        <ul className="mt-2.5 flex flex-wrap gap-1.5 sm:pl-[3.75rem]">
          {visiveis.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onAbrirPessoa(m)}
                className="inline-flex max-w-full items-center gap-1.5 rounded-pill border border-line bg-surface py-0.5 pr-2.5 pl-0.5 text-left text-xs text-ink-700 transition-colors hover:border-brand-700 hover:text-brand-700"
                title={`Abrir a ficha de ${m.name}${m.zone || m.section ? ` · Zona ${m.zone ?? '?'}, Seção ${m.section ?? '?'}` : ''}`}
              >
                <Avatar name={m.name} src={m.photo} size="xs" />
                <span className="min-w-0 wrap-break-word font-medium">{m.name}</span>
              </button>
            </li>
          ))}
          {equipe.length > EQUIPE_DE_CARA ? (
            <li>
              <button
                type="button"
                onClick={() => setToda((v) => !v)}
                className="inline-flex min-h-7 items-center gap-1 rounded-pill bg-accent-50 px-2.5 text-xs font-semibold text-accent-700 hover:bg-accent-100"
              >
                {toda ? 'Mostrar menos' : `Ver mais ${formatNumber(equipe.length - EQUIPE_DE_CARA)}`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}
