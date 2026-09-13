'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Controles DO MAPA.
 *
 * Ficam sobre os tiles, no canto, como em qualquer mapa: tela cheia,
 * filtros e ranking sao ferramentas de quem esta olhando o mapa, e nao
 * botoes do cartao em volta dele. Em tela cheia o cartao nao existe mais —
 * so o mapa —, entao um botao que morasse no cabecalho simplesmente sumiria
 * junto com ele.
 *
 * Acima de tudo que o Leaflet desenha: os paineis dele param em 1000, e um
 * controle que some atras de um balao aberto nao e um controle. Os botoes
 * (1200) ficam ainda acima dos paineis flutuantes (1100) — um painel que
 * cobre o proprio botao que o fecha e uma armadilha.
 */

/** Botao redondo do canto do mapa. */
export function MapControlButton({
  label,
  icon,
  onClick,
  active = false,
  badge,
  compact = false,
}: {
  /** Texto lido por leitor de tela e mostrado ao lado do icone no desktop. */
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  /** Numero ao lado do rotulo (ex.: filtros ligados). */
  badge?: number;
  /** So o icone, sem o texto. Usado onde o espaco e do mapa. */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active || undefined}
      title={label}
      className={cn(
        'pointer-events-auto inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3 text-xs font-semibold shadow-overlay backdrop-blur transition-colors',
        active
          ? 'border-brand-700 bg-brand-700 text-white hover:bg-brand-800'
          : 'border-line bg-surface/95 text-ink-700 hover:bg-surface',
      )}
    >
      <span aria-hidden="true" className="flex size-4 items-center justify-center">
        {icon}
      </span>
      <span className={cn(compact ? 'sr-only' : 'hidden sm:inline')}>{label}</span>
      {badge && badge > 0 ? (
        <span
          className={cn(
            'rounded-pill px-1.5 text-[0.625rem] font-bold tabular-nums',
            active ? 'bg-white/20 text-white' : 'bg-brand-50 text-brand-700',
          )}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Fila de controles em um canto do mapa.
 *
 * EM LINHA, e nao empilhados: empilhados, eles desciam por baixo do painel
 * flutuante e ficavam inalcancaveis — era impossivel abrir os filtros com o
 * ranking aberto. Em linha, os botoes ocupam uma faixa so no topo e os
 * paineis comecam abaixo dela.
 */
export function MapControlStack({
  corner,
  children,
  className,
}: {
  corner: 'top-right' | 'top-left';
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // O contorno nao intercepta o mouse: arrastar o mapa continua
        // funcionando no espaco vazio entre os botoes.
        'pointer-events-none absolute z-[1200] flex flex-wrap items-center gap-2',
        corner === 'top-right' ? 'top-3 right-3 justify-end' : 'top-3 left-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Painel flutuante sobre o mapa (filtros, ranking).
 *
 * Largura travada na tela: em um celular estreito, uma coluna de 20rem
 * passaria da borda e a pessoa nao alcancaria o proprio botao de fechar.
 */
export function MapPanel({
  side,
  children,
  className,
}: {
  side: 'left' | 'right';
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'pointer-events-auto absolute z-[1100] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-card border border-line bg-surface/97 shadow-overlay backdrop-blur',
        side === 'left' ? 'left-3' : 'right-3',
        className,
      )}
    >
      {children}
    </div>
  );
}
