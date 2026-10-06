'use client';

import type { ReactNode } from 'react';
import { MapPin, School, X } from 'lucide-react';
import { conversao } from '@/lib/domain/confronto';
import { fotoDoCandidatoUrl, type CandidatoDaVotacao } from '@/lib/domain/votacao-tse';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/text';
import { Contador } from '@/components/ui/Contador';
import { FotoDoCandidato } from '@/components/apuracao/FotoDoCandidato';

export interface CandidatoNoPlacar {
  candidato: CandidatoDaVotacao;
  cor: string;
  /** Votos dele nas escolas do time (nulo enquanto carrega). */
  apurado: number | null;
}

/**
 * O placar dos candidatos escolhidos, logo acima do mapa: a estimativa do
 * time (uma so) e, para cada candidato, foto, votos nas escolas do time e
 * conversao. Tocar um candidato troca o que o mapa desenha.
 */
export function PlacarDosCandidatos({
  escolasDoTime,
  estimativa,
  candidatos,
  ativoId,
  onAtivo,
  onRemover,
  pdf,
}: {
  escolasDoTime: number;
  estimativa: number;
  candidatos: CandidatoNoPlacar[];
  ativoId: string | null;
  onAtivo: (id: string) => void;
  onRemover: (id: string) => void;
  pdf?: ReactNode;
}) {
  const varios = candidatos.length > 1;
  if (escolasDoTime === 0) {
    return (
      <p className="basis-full rounded-control border border-line bg-ink-50 px-3 py-2 text-xs text-ink-700">
        Este time não tinha estimativa de votos em nenhuma escola deste recorte. O mapa mostra só a apuração.
      </p>
    );
  }

  return (
    <section
      aria-label="Estimativa x apuração dos candidatos"
      className="relative z-10 basis-full rounded-card border border-gold-500/40 bg-gradient-to-r from-gold-50 via-surface to-surface"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gold-500/20 px-3 py-2">
        <p className="flex items-center gap-2 text-xs font-semibold text-gold-700">
          <span className="flex size-6 items-center justify-center rounded-full bg-navy-900 text-gold-400">
            <School aria-hidden="true" className="size-3.5" />
          </span>
          {formatNumber(escolasDoTime)} {escolasDoTime === 1 ? 'escola do time' : 'escolas do time'} em destaque
        </p>
        <p className="text-xs text-ink-700">
          Estimativa do time: <b className="text-navy-900 tabular-nums">{formatNumber(estimativa)}</b>
        </p>
        <span className="ml-auto flex items-center gap-2">
          <span className="hidden text-[0.6875rem] text-ink-500 lg:inline">Clique numa escola dourada para o raio-x</span>
          {pdf}
        </span>
      </div>

      <ul
        className={cn(
          'grid gap-2 p-2',
          candidatos.length === 1 && 'sm:max-w-md',
          candidatos.length === 2 && 'sm:grid-cols-2',
          candidatos.length === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
          candidatos.length >= 4 && 'sm:grid-cols-2 xl:grid-cols-4',
        )}
      >
        {candidatos.map(({ candidato: c, cor, apurado }, i) => {
          const ativo = c.id === ativoId;
          const conv = apurado === null ? null : conversao({ estimativa, apurado });
          const corConv = conv === null ? 'text-ink-500' : conv >= 100 ? 'text-success-700' : conv >= 80 ? 'text-gold-700' : 'text-danger-700';
          return (
            <li key={c.id} className="relative min-w-0 animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <button
                type="button"
                onClick={() => onAtivo(c.id)}
                aria-pressed={ativo}
                disabled={!varios}
                className={cn(
                  'flex w-full min-w-0 items-center gap-3 rounded-control border bg-surface p-2.5 pr-9 text-left transition-all',
                  varios && 'hover:-translate-y-0.5 hover:shadow-card',
                  ativo && varios ? 'border-transparent shadow-card' : 'border-line',
                  !varios && 'cursor-default',
                )}
                style={ativo && varios ? { boxShadow: `0 0 0 2px ${cor}` } : undefined}
              >
                <span className="relative shrink-0">
                  <FotoDoCandidato cargo={c.cargoCodigo} sqcand={null} src={fotoDoCandidatoUrl(c)} nome={c.nome} tamanho="md" />
                  <span aria-hidden="true" className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full ring-2 ring-surface" style={{ background: cor }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block wrap-break-word text-sm font-semibold text-ink-900">{c.nome}</span>
                  <span className="block wrap-break-word text-[0.6875rem] text-ink-500">
                    {c.numero} · {c.cargo}
                  </span>
                  <span className="mt-1 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xl leading-none font-bold text-ink-900 tabular-nums">
                      {apurado === null ? '…' : <Contador valor={apurado} />}
                    </span>
                    <span className="text-[0.6875rem] text-ink-500">nas escolas do time</span>
                    {conv !== null ? <span className={cn('text-xs font-bold tabular-nums', corConv)}>{Math.round(conv)}%</span> : null}
                  </span>
                  <span className={cn('mt-1.5 block h-1.5 overflow-hidden rounded-pill bg-ink-100', ativo && varios && 'mr-12')}>
                    <span
                      className="block h-full rounded-pill transition-[width] duration-700 ease-out"
                      style={{ width: `${Math.min(100, conv ?? 0)}%`, background: varios ? cor : '#e0a426' }}
                    />
                  </span>
                </span>
              </button>
              {ativo && varios ? (
                <span className="pointer-events-none absolute right-2 bottom-2 inline-flex items-center gap-0.5 rounded-pill bg-navy-900 px-1.5 py-0.5 text-[0.625rem] font-semibold text-gold-400">
                  <MapPin aria-hidden="true" className="size-2.5" /> no mapa
                </span>
              ) : null}
              {varios ? (
                <button
                  type="button"
                  onClick={() => onRemover(c.id)}
                  aria-label={`Tirar ${c.nome}`}
                  title={`Tirar ${c.nome}`}
                  className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
