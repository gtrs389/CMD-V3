'use client';

/**
 * Grafico de area dos cadastros por dia.
 *
 * SVG puro, sem biblioteca: sao sete pontos e uma curva suave, o que nao
 * justifica uma dependencia nova. Escala vertical calculada a partir do maior
 * valor real da serie.
 */

export interface ChartPoint {
  /** Rotulo curto do dia, ja no idioma da aplicacao. */
  label: string;
  value: number;
}

interface MembersChartProps {
  points: ChartPoint[];
  /** Rotulo do balao destacado no ultimo ponto. */
  highlight?: string;
}

const WIDTH = 560;
const HEIGHT = 132;
const TOP = 26;
const BOTTOM = 12;

/** Curva suave por pontos medios: evita oscilacao entre valores distantes. */
function smoothPath(coords: Array<{ x: number; y: number }>): string {
  if (coords.length === 0) return '';
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;

  let path = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i += 1) {
    const previous = coords[i - 1];
    const current = coords[i];
    const controlX = (previous.x + current.x) / 2;
    path += ` C ${controlX} ${previous.y}, ${controlX} ${current.y}, ${current.x} ${current.y}`;
  }
  return path;
}

export function MembersChart({ points, highlight }: MembersChartProps) {
  const max = Math.max(1, ...points.map((point) => point.value));
  const step = points.length > 1 ? WIDTH / (points.length - 1) : 0;

  const coords = points.map((point, index) => ({
    x: points.length > 1 ? index * step : WIDTH / 2,
    y: HEIGHT - BOTTOM - (point.value / max) * (HEIGHT - TOP - BOTTOM),
  }));

  const line = smoothPath(coords);
  const area = coords.length > 0 ? `${line} L ${coords[coords.length - 1].x} ${HEIGHT} L ${coords[0].x} ${HEIGHT} Z` : '';
  const last = coords[coords.length - 1];

  return (
    <div className="mt-4">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Cadastros por dia nos últimos sete dias"
        className="h-[8.25rem] w-full"
      >
        <defs>
          <linearGradient id="cmd-chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent-400)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--color-accent-400)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={area} fill="url(#cmd-chart-fill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-accent-400)"
          strokeWidth="2.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {last ? (
          <circle
            cx={last.x}
            cy={last.y}
            r="4"
            fill="var(--color-navy-900)"
            stroke="var(--color-accent-400)"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>

      {/* O balao fica fora do SVG para nao distorcer com o preserveAspectRatio. */}
      {highlight && last ? (
        <p className="-mt-[7.5rem] mr-1 mb-[5.5rem] ml-auto w-fit rounded-md bg-white px-2 py-0.5 text-[0.6875rem] font-semibold text-navy-900 shadow-card">
          {highlight}
        </p>
      ) : null}

      <div className="mt-1 flex justify-between text-[0.6875rem] text-navy-300">
        {points.map((point, index) => (
          <span key={`${point.label}-${index}`}>{point.label}</span>
        ))}
      </div>
    </div>
  );
}
