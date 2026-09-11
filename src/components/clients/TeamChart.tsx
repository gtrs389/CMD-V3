'use client';

/**
 * Grafico dos novos cadastros por dia dentro do cartao azul-marinho.
 *
 * SVG puro: sete pontos, area preenchida, marcadores e escala vertical
 * calculada a partir do maior valor real da serie. Os rotulos ficam em HTML
 * para nao distorcerem junto com o desenho.
 */

export interface TeamChartPoint {
  /** Rotulo curto do dia, ja no idioma da aplicacao. */
  label: string;
  value: number;
}

const WIDTH = 320;
const HEIGHT = 132;
const TOP = 8;
const BOTTOM = 8;

/** Topo "redondo" da escala: 4 divisoes inteiras acima do maior valor. */
function scaleTop(max: number): number {
  if (max <= 4) return 4;
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((value) => value >= rough);
  return Math.ceil((step ?? magnitude) * 4);
}

/** Curva suave por pontos medios: evita oscilacao entre valores distantes. */
function smoothPath(coords: Array<{ x: number; y: number }>): string {
  if (coords.length === 0) return '';
  let path = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i += 1) {
    const previous = coords[i - 1];
    const current = coords[i];
    const controlX = (previous.x + current.x) / 2;
    path += ` C ${controlX} ${previous.y}, ${controlX} ${current.y}, ${current.x} ${current.y}`;
  }
  return path;
}

export function TeamChart({ points }: { points: TeamChartPoint[] }) {
  const top = scaleTop(Math.max(0, ...points.map((point) => point.value)));
  const ticks = [0, 1, 2, 3, 4].map((index) => Math.round((top / 4) * index)).reverse();

  const step = points.length > 1 ? WIDTH / (points.length - 1) : 0;
  const coords = points.map((point, index) => ({
    x: points.length > 1 ? index * step : WIDTH / 2,
    y: HEIGHT - BOTTOM - (point.value / top) * (HEIGHT - TOP - BOTTOM),
  }));

  const line = smoothPath(coords);
  const area = coords.length
    ? `${line} L ${coords[coords.length - 1].x} ${HEIGHT} L ${coords[0].x} ${HEIGHT} Z`
    : '';

  return (
    <div className="flex gap-2">
      <div
        aria-hidden="true"
        className="flex h-[8.25rem] shrink-0 flex-col justify-between text-[0.625rem] leading-none text-navy-300"
      >
        {ticks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Novos cadastros por dia nos últimos sete dias"
          className="h-[8.25rem] w-full"
        >
          <defs>
            <linearGradient id="cmd-team-chart" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent-400)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="var(--color-accent-400)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((tick, index) => {
            const y = TOP + ((HEIGHT - TOP - BOTTOM) / (ticks.length - 1)) * index;
            return (
              <line
                key={tick}
                x1="0"
                x2={WIDTH}
                y1={y}
                y2={y}
                stroke="var(--color-navy-700)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          <path d={area} fill="url(#cmd-team-chart)" />
          <path
            d={line}
            fill="none"
            stroke="var(--color-accent-400)"
            strokeWidth="2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {coords.map((coord, index) => (
            <circle
              key={points[index].label + String(index)}
              cx={coord.x}
              cy={coord.y}
              r="3"
              fill="var(--color-accent-400)"
              stroke="var(--color-navy-900)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        <div className="mt-1 flex justify-between text-[0.625rem] leading-none text-navy-300">
          {points.map((point, index) => (
            <span key={`${point.label}-${index}`}>{point.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
