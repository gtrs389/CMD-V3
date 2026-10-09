'use client';

import { useEffect, useRef, useState } from 'react';
import { Ban, ChevronDown, MapPin } from 'lucide-react';
import type { ModoDasZeradas } from '@/lib/domain/secoes-zeradas';
import { cn } from '@/lib/utils/cn';
import { BotaoDePdf } from '../BotaoDePdf';

/**
 * "Seções com 0 voto (PDF)": todas as secoes das escolas do municipio onde
 * os candidatos escolhidos tiveram zero, com a gente que cada Lider
 * cadastrou na escola e na secao. O municipio e o do filtro do mapa.
 */
export function BotaoDasZeradas({
  candidatos,
  municipios,
  onBaixar,
}: {
  candidatos: { id: string; nome: string; cor: string }[];
  municipios: string[];
  onBaixar: (modo: ModoDasZeradas) => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<ModoDasZeradas>('TODOS');
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  if (candidatos.length === 0) return null;
  const varios = candidatos.length > 1;
  const primeiro = (nome: string) => nome.split(' ')[0];

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        title="Todas as seções do município onde os candidatos tiveram 0 voto, com a gente de cada líder"
        onClick={() => setAberto((a) => !a)}
        className={cn(
          'inline-flex min-h-9 items-center gap-1.5 rounded-control border px-2.5 text-xs font-semibold whitespace-nowrap transition-colors',
          aberto ? 'border-danger-600 bg-danger-600 text-white' : 'border-danger-200 bg-danger-50 text-danger-700 hover:border-danger-600',
        )}
      >
        <Ban aria-hidden="true" className="size-3.5" />
        Seções com 0 voto (PDF)
        <ChevronDown aria-hidden="true" className={cn('size-3.5 transition-transform', aberto && 'rotate-180')} />
      </button>

      {aberto ? (
        <div
          role="dialog"
          aria-label="Seções com 0 voto"
          className="absolute right-0 z-[1200] mt-1.5 w-[22rem] max-w-[calc(100vw-2rem)] animate-scale-in max-sm:fixed max-sm:inset-x-4 max-sm:bottom-4 max-sm:mt-0 max-sm:w-auto max-sm:max-w-none overflow-hidden rounded-card border border-line bg-surface shadow-overlay"
        >
          <div className="bg-navy-900 px-4 py-3 text-white">
            <p className="text-[0.625rem] font-bold tracking-[0.14em] text-gold-400 uppercase">Seções zeradas</p>
            <p className="mt-0.5 text-sm leading-snug font-semibold">
              Cada seção onde {varios ? 'os candidatos tiveram' : `${primeiro(candidatos[0].nome)} teve`} 0 voto, escola por escola — com quantas pessoas cada líder cadastrou ali.
            </p>
          </div>

          <div className="space-y-3 p-3">
            <div>
              <p className="text-[0.625rem] font-bold tracking-[0.12em] text-ink-500 uppercase">Município</p>
              {municipios.length ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {municipios.map((m) => (
                    <span key={m} className="inline-flex items-center gap-1 rounded-pill bg-ink-100 px-2.5 py-1 text-xs font-semibold text-navy-900">
                      <MapPin aria-hidden="true" className="size-3" /> {m}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1 rounded-control border border-warning-600/30 bg-warning-50 px-2.5 py-2 text-xs text-warning-600">
                  Escolha o município no filtro do mapa: o relatório lista todas as seções dele.
                </p>
              )}
            </div>

            <div>
              <p className="text-[0.625rem] font-bold tracking-[0.12em] text-ink-500 uppercase">Candidatos</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {candidatos.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1.5 rounded-pill border border-line px-2.5 py-1 text-xs font-semibold text-ink-700">
                    <span aria-hidden="true" className="size-2 rounded-full" style={{ background: c.cor }} />
                    {c.nome}
                  </span>
                ))}
              </div>
            </div>

            {varios ? (
              <fieldset>
                <legend className="text-[0.625rem] font-bold tracking-[0.12em] text-ink-500 uppercase">Quais seções</legend>
                <div className="mt-1 grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ['TODOS', 'Todos com 0', 'Nenhum deles teve voto'],
                      ['ALGUM', 'Algum com 0', 'Ao menos um zerou'],
                    ] as const
                  ).map(([valor, rotulo, detalhe]) => (
                    <button
                      key={valor}
                      type="button"
                      aria-pressed={modo === valor}
                      onClick={() => setModo(valor)}
                      className={cn(
                        'rounded-control border px-2.5 py-2 text-left transition-colors',
                        modo === valor ? 'border-navy-900 bg-navy-900 text-white' : 'border-line hover:border-navy-300',
                      )}
                    >
                      <span className="block text-xs font-bold">{rotulo}</span>
                      <span className={cn('block text-[0.6875rem]', modo === valor ? 'text-white/75' : 'text-ink-500')}>{detalhe}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
              <p className="text-[0.6875rem] text-ink-500">Seções com gente do time vêm em vermelho.</p>
              <BotaoDePdf onClick={() => onBaixar(varios ? modo : 'TODOS')} rotulo="Baixar PDF" variante="cheio" disabled={municipios.length === 0} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
