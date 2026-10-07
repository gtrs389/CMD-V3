'use client';

import { useState, type CSSProperties } from 'react';
import { ChevronDown, Grid3x3, Landmark, MapPinned, School, X } from 'lucide-react';
import type { OndeAEquipeVota as Dados } from '@/lib/domain/onde-a-equipe-vota';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/text';
import { Spinner } from '@/components/ui/Spinner';

/** O recorte da lista da Equipe escolhido nos graficos. */
export type RecorteDaEquipe =
  | { tipo: 'escola'; id: string; rotulo: string }
  | { tipo: 'zona'; zona: number; rotulo: string }
  | { tipo: 'secao'; zona: number; secao: number; rotulo: string }
  | null;

/** Quantas escolas aparecem antes do "ver todas". */
const ESCOLAS_DE_CARA = 8;

/**
 * Onde a Equipe do Lider vota, em tres quadros: as escolas (da que tem mais
 * gente para a que tem menos, com as secoes de cada uma), as zonas e as
 * secoes (uma grade por zona, mais escuro onde ha mais gente). Tocar numa
 * escola, zona ou secao recorta a lista da Equipe logo abaixo.
 */
export function OndeAEquipeVota({
  nome,
  total,
  dados,
  carregando,
  recorte,
  onRecorte,
}: {
  /** Primeiro nome do Lider, nos titulos. */
  nome: string;
  /** Tamanho da Equipe. */
  total: number;
  dados: Dados | null;
  carregando: boolean;
  recorte: RecorteDaEquipe;
  onRecorte: (r: RecorteDaEquipe) => void;
}) {
  const [todasAsEscolas, setTodasAsEscolas] = useState(false);
  if (total === 0) return null;

  const localizados = dados ? dados.escolas.reduce((t, e) => t + e.total, 0) : 0;
  const maiorEscola = Math.max(1, ...(dados?.escolas.map((e) => e.total) ?? [1]));
  const maiorZona = Math.max(1, ...(dados?.zonas.map((z) => z.total) ?? [1]));
  const maiorSecao = Math.max(1, ...(dados?.secoes.map((s) => s.total) ?? [1]));
  const escolas = dados ? (todasAsEscolas ? dados.escolas : dados.escolas.slice(0, ESCOLAS_DE_CARA)) : [];
  const porZona = new Map<number, NonNullable<Dados>['secoes']>();
  for (const s of dados?.secoes ?? []) porZona.set(s.zona, [...(porZona.get(s.zona) ?? []), s]);
  const pct = (n: number) => `${Math.round((n / Math.max(1, total)) * 100)}%`;
  const igual = (r: RecorteDaEquipe) => JSON.stringify(r) === JSON.stringify(recorte);
  const alternar = (r: NonNullable<RecorteDaEquipe>) => onRecorte(igual(r) ? null : r);

  return (
    <section aria-label={`Onde a Equipe de ${nome} vota`} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-ink-900">
            <MapPinned aria-hidden="true" className="size-5 text-accent-600" />
            Onde a Equipe de {nome} vota
          </h3>
          <p className="text-xs text-ink-500">
            {carregando || !dados
              ? 'Buscando as escolas de cada seção…'
              : `${formatNumber(localizados)} de ${formatNumber(total)} com a escola identificada pela zona e seção` +
                (dados.semZonaSecao ? ` · ${formatNumber(dados.semZonaSecao)} sem zona/seção no cadastro` : '') +
                (dados.semLocal ? ` · ${formatNumber(dados.semLocal)} com seção fora da tabela do TSE` : '')}
          </p>
        </div>
        {recorte ? (
          <button
            type="button"
            onClick={() => onRecorte(null)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-pill bg-navy-900 px-3 text-xs font-semibold text-gold-400"
          >
            {recorte.rotulo}
            <X aria-hidden="true" className="size-3.5" />
          </button>
        ) : (
          <p className="text-[0.6875rem] text-ink-400">Toque numa escola, zona ou seção para ver quem vota lá</p>
        )}
      </div>

      {carregando || !dados ? (
        <div className="grid gap-3 lg:grid-cols-3" role="status" aria-label="Carregando as escolas">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex h-56 animate-shimmer items-center justify-center rounded-card border border-line bg-surface" style={{ animationDelay: `${i * 90}ms` }}>
              {i === 1 ? <Spinner className="size-5 text-ink-400" /> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,1.2fr)]">
          {/* ESCOLAS */}
          <div className="rounded-card border border-line bg-surface">
            <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <School aria-hidden="true" className="size-4 text-accent-600" />
                Escolas
              </p>
              <span className="rounded-pill bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-700 tabular-nums">{formatNumber(dados.escolas.length)}</span>
            </header>
            {dados.escolas.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-500">Nenhuma escola identificada: falta zona e seção nos cadastros.</p>
            ) : (
              <ol className="divide-y divide-line">
                {escolas.map((e, i) => {
                  const r = { tipo: 'escola' as const, id: e.local.id, rotulo: e.local.nome };
                  const ativo = igual(r);
                  return (
                    <li key={e.local.id} className="cmd-cascata" style={{ '--cmd-atraso': `${Math.min(i, 10) * 35}ms` } as CSSProperties}>
                      <button
                        type="button"
                        onClick={() => alternar(r)}
                        aria-pressed={ativo}
                        className={cn('grid w-full grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2.5 text-left transition-colors', ativo ? 'bg-gold-50' : 'hover:bg-ink-50')}
                      >
                        <span className={cn('flex size-7 items-center justify-center rounded-full text-[0.6875rem] font-bold tabular-nums', i < 3 ? 'bg-gold-400 text-navy-900' : 'bg-ink-100 text-ink-700')}>
                          {i + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm leading-snug font-semibold wrap-break-word text-ink-900">{e.local.nome}</span>
                          <span className="mt-1 block h-2 overflow-hidden rounded-pill bg-ink-100">
                            <span
                              className="cmd-barra-viva block h-full rounded-pill bg-gradient-to-r from-navy-800 to-accent-600"
                              style={{ width: `${Math.max(4, (e.total / maiorEscola) * 100)}%`, '--cmd-atraso': `${80 + Math.min(i, 10) * 35}ms` } as CSSProperties}
                            />
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            <span className="text-[0.6875rem] text-ink-500">Zona {e.local.zona}{e.local.cidade ? ` · ${e.local.cidade}` : ''} ·</span>
                            {e.secoes.map((s) => (
                              <span key={s.secao} className="rounded-pill bg-ink-100 px-1.5 text-[0.625rem] font-semibold text-ink-700 tabular-nums">
                                {s.secao}
                                <span className="text-ink-400"> · {s.total}</span>
                              </span>
                            ))}
                          </span>
                        </span>
                        <span className="text-right tabular-nums">
                          <span className="block text-lg leading-none font-bold text-navy-900">{formatNumber(e.total)}</span>
                          <span className="block text-[0.6875rem] text-ink-500">{pct(e.total)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
            {dados.escolas.length > ESCOLAS_DE_CARA ? (
              <button
                type="button"
                onClick={() => setTodasAsEscolas((v) => !v)}
                className="flex w-full items-center justify-center gap-1 border-t border-line py-2.5 text-xs font-semibold text-accent-700 hover:bg-accent-50"
              >
                {todasAsEscolas ? 'Mostrar menos' : `Ver todas as ${formatNumber(dados.escolas.length)} escolas`}
                <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', todasAsEscolas && 'rotate-180')} />
              </button>
            ) : null}
          </div>

          {/* ZONAS */}
          <div className="rounded-card border border-line bg-surface">
            <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <Landmark aria-hidden="true" className="size-4 text-accent-600" />
                Zonas
              </p>
              <span className="rounded-pill bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-700 tabular-nums">{formatNumber(dados.zonas.length)}</span>
            </header>
            {dados.zonas.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-500">Sem zona nos cadastros.</p>
            ) : (
              <ul className="space-y-1 p-3">
                {dados.zonas.map((z) => {
                  const r = { tipo: 'zona' as const, zona: z.zona, rotulo: `Zona ${z.zona}` };
                  const ativo = igual(r);
                  return (
                    <li key={z.zona}>
                      <button
                        type="button"
                        onClick={() => alternar(r)}
                        aria-pressed={ativo}
                        className={cn('w-full rounded-control px-2 py-2 text-left transition-colors', ativo ? 'bg-gold-50 ring-1 ring-gold-500/50' : 'hover:bg-ink-50')}
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold text-ink-900">Zona {z.zona}</span>
                          <span className="text-sm font-bold text-navy-900 tabular-nums">
                            {formatNumber(z.total)} <span className="text-[0.6875rem] font-normal text-ink-500">{pct(z.total)}</span>
                          </span>
                        </span>
                        <span className="mt-1 block h-2.5 overflow-hidden rounded-pill bg-ink-100">
                          <span className="cmd-barra-viva block h-full rounded-pill bg-gold-500" style={{ width: `${Math.max(4, (z.total / maiorZona) * 100)}%` }} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* SECOES */}
          <div className="rounded-card border border-line bg-surface">
            <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <Grid3x3 aria-hidden="true" className="size-4 text-accent-600" />
                Seções
              </p>
              <span className="rounded-pill bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-700 tabular-nums">{formatNumber(dados.secoes.length)}</span>
            </header>
            {dados.secoes.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-500">Sem seção nos cadastros.</p>
            ) : (
              <div className="space-y-3 p-3">
                {[...porZona.entries()].map(([zona, secoes]) => (
                  <div key={zona}>
                    <p className="mb-1.5 text-[0.6875rem] font-semibold tracking-wide text-ink-500 uppercase">Zona {zona}</p>
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-1.5">
                      {secoes.map((s) => {
                        const r = { tipo: 'secao' as const, zona: s.zona, secao: s.secao, rotulo: `Seção ${s.secao} · Zona ${s.zona}` };
                        const ativo = igual(r);
                        const forca = 0.15 + 0.85 * (s.total / maiorSecao);
                        return (
                          <li key={s.secao}>
                            <button
                              type="button"
                              onClick={() => alternar(r)}
                              aria-pressed={ativo}
                              title={`Seção ${s.secao}: ${s.total} ${s.total === 1 ? 'pessoa' : 'pessoas'}${s.local ? ` · ${s.local.nome}` : ' · fora da tabela do TSE'}`}
                              className={cn(
                                'flex w-full flex-col items-center rounded-md py-1.5 leading-tight transition-transform hover:-translate-y-0.5',
                                ativo && 'ring-2 ring-gold-500 ring-offset-1',
                              )}
                              style={{ background: `rgba(15, 30, 53, ${forca})`, color: forca > 0.5 ? '#fff' : '#0f1e35' }}
                            >
                              <span className="text-[0.625rem] opacity-80">{s.secao}</span>
                              <span className="text-sm font-bold tabular-nums">{s.total}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                <p className="text-[0.6875rem] text-ink-400">Número pequeno: a seção. Grande: quantas pessoas votam nela. Mais escuro, mais gente.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
