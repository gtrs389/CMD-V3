'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Grid3x3, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/text';

/** Uma secao que pode ser escolhida: a chave (`zona/secao`) e quanta gente do time vota nela. */
export interface OpcaoDeSecao {
  chave: string;
  zona: string | null;
  secao: string | null;
  /** Pessoas do time que votam ali. */
  gente: number;
  /** Cor do resultado (azul venceu, vermelho perdeu...), quando ha. */
  cor?: string;
}

/**
 * "Filtrar por seção": a mesma peca no Raio-X da escola e na Sala de
 * Confronto. As secoes escolhidas aparecem como fichas (cada uma sai num
 * toque); o botao abre a lista — com busca, por zona, com a gente do time
 * de cada secao — e os atalhos "Todas" e "Só com gente do time". Nada
 * escolhido = todas as secoes.
 */
export function FiltroDeSecoes({
  opcoes,
  escolhidas,
  onChange,
  escuro = false,
  className,
}: {
  opcoes: OpcaoDeSecao[];
  escolhidas: string[];
  onChange: (chaves: string[]) => void;
  /** Sobre o azul-marinho. */
  escuro?: boolean;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const caixa = useRef<HTMLDivElement>(null);
  const marcadas = useMemo(() => new Set(escolhidas), [escolhidas]);
  const porChave = useMemo(() => new Map(opcoes.map((o) => [o.chave, o])), [opcoes]);

  // Fora da caixa ou Esc: fecha.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setAberto(false);
      }
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla, true);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla, true);
    };
  }, [aberto]);

  const termo = busca.trim().replace(/^0+(?=\d)/, '');
  const visiveis = opcoes.filter((o) => !termo || (o.secao ?? '').includes(termo) || `zona ${o.zona ?? ''}`.includes(termo.toLowerCase()));
  const zonas = [...new Set(visiveis.map((o) => o.zona ?? '?'))];
  const alternar = (chave: string) => onChange(marcadas.has(chave) ? escolhidas.filter((k) => k !== chave) : [...escolhidas, chave]);
  const gente = escolhidas.reduce((t, k) => t + (porChave.get(k)?.gente ?? 0), 0);

  if (opcoes.length < 2) return null;

  return (
    <div ref={caixa} className={cn('relative flex flex-wrap items-center gap-1.5', className)}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className={cn(
          'inline-flex min-h-9 items-center gap-1.5 rounded-pill border px-3 text-xs font-bold transition-colors',
          escolhidas.length
            ? 'border-gold-500 bg-gold-400 text-navy-900'
            : escuro
              ? 'border-white/25 bg-white/10 text-white hover:bg-white/20'
              : 'border-line bg-surface text-ink-700 hover:border-navy-300',
        )}
      >
        <Grid3x3 aria-hidden="true" className="size-3.5" />
        {escolhidas.length
          ? `${escolhidas.length} ${escolhidas.length === 1 ? 'seção' : 'seções'} · ${formatNumber(gente)} do time`
          : `Todas as ${opcoes.length} seções`}
        <ChevronDown aria-hidden="true" className={cn('size-3.5 transition-transform', aberto && 'rotate-180')} />
      </button>

      {escolhidas.slice(0, 8).map((k) => {
        const o = porChave.get(k);
        return (
          <button
            key={k}
            type="button"
            onClick={() => alternar(k)}
            title="Tirar esta seção do filtro"
            className={cn(
              'group inline-flex min-h-8 items-center gap-1 rounded-pill border py-0.5 pr-1 pl-2.5 text-[0.6875rem] font-bold transition-colors',
              escuro ? 'border-white/25 bg-white/10 text-white' : 'border-gold-500/50 bg-gold-50 text-gold-700',
            )}
          >
            Seção {o?.secao ?? k.split('/')[1]}
            <span className="flex size-5 items-center justify-center rounded-full bg-black/10 group-hover:bg-danger-600 group-hover:text-white">
              <X aria-hidden="true" className="size-3" />
            </span>
          </button>
        );
      })}
      {escolhidas.length > 8 ? <span className={cn('text-[0.6875rem] font-semibold', escuro ? 'text-white/70' : 'text-ink-500')}>+{escolhidas.length - 8}</span> : null}
      {escolhidas.length ? (
        <button
          type="button"
          onClick={() => onChange([])}
          className={cn('text-[0.6875rem] font-semibold underline-offset-2 hover:underline', escuro ? 'text-white/80' : 'text-ink-500')}
        >
          ver todas
        </button>
      ) : null}

      {aberto ? (
        <div className="absolute top-full left-0 z-[60] mt-2 w-[min(22rem,calc(100vw-2rem))] animate-fade-in overflow-hidden rounded-card border border-line bg-surface text-ink-900 shadow-overlay">
          <div className="border-b border-line p-2.5">
            <label className="relative flex items-center">
              <span className="sr-only">Buscar seção</span>
              <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 z-10 size-3.5 text-ink-400" />
              <input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Número da seção"
                inputMode="numeric"
                className="min-h-9 w-full rounded-pill border border-line bg-ink-50 pr-3 pl-8 text-sm focus:border-accent-600 focus:bg-surface focus:outline-none"
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => onChange([])} className="rounded-pill border border-line px-2.5 py-1 text-[0.6875rem] font-semibold hover:bg-ink-50">
                Todas
              </button>
              <button
                type="button"
                onClick={() => onChange(opcoes.filter((o) => o.gente > 0).map((o) => o.chave))}
                className="rounded-pill border border-line px-2.5 py-1 text-[0.6875rem] font-semibold hover:bg-ink-50"
              >
                Só com gente do time
              </button>
              {visiveis.length !== opcoes.length && visiveis.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onChange([...new Set([...escolhidas, ...visiveis.map((o) => o.chave)])])}
                  className="rounded-pill border border-line px-2.5 py-1 text-[0.6875rem] font-semibold hover:bg-ink-50"
                >
                  Marcar as {visiveis.length} achadas
                </button>
              ) : null}
            </div>
          </div>
          <div className="scrollbar-slim max-h-72 overflow-y-auto p-1.5">
            {visiveis.length === 0 ? <p className="px-3 py-4 text-center text-xs text-ink-500">Nenhuma seção com esse número.</p> : null}
            {zonas.map((z) => (
              <div key={z}>
                <p className="px-2 pt-1.5 pb-1 text-[0.625rem] font-bold tracking-[0.12em] text-ink-500 uppercase">Zona {z}</p>
                <ul className="grid grid-cols-2 gap-1">
                  {visiveis
                    .filter((o) => (o.zona ?? '?') === z)
                    .map((o) => {
                      const ativa = marcadas.has(o.chave);
                      return (
                        <li key={o.chave}>
                          <button
                            type="button"
                            aria-pressed={ativa}
                            onClick={() => alternar(o.chave)}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-control border px-2 py-1.5 text-left transition-colors',
                              ativa ? 'border-gold-500 bg-gold-50' : 'border-transparent hover:bg-ink-50',
                            )}
                          >
                            <span
                              className={cn(
                                'flex size-4 shrink-0 items-center justify-center rounded-[5px] border-2',
                                ativa ? 'border-gold-500 bg-gold-500 text-navy-900' : 'border-ink-200',
                              )}
                            >
                              {ativa ? <Check aria-hidden="true" className="size-2.5" strokeWidth={4} /> : null}
                            </span>
                            {o.cor ? <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: o.cor }} /> : null}
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-bold tabular-nums">Seção {o.secao ?? '?'}</span>
                              <span className={cn('block text-[0.625rem] tabular-nums', o.gente ? 'text-ink-500' : 'text-ink-400')}>
                                {o.gente ? `${formatNumber(o.gente)} do time` : 'sem gente do time'}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
