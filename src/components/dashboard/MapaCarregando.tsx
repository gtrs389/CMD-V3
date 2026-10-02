/**
 * Espera do mapa: um radar varrendo uma malha, com pontos acendendo onde as
 * pessoas vao aparecer. Diz "o mapa esta vindo" sem uma palavra a mais.
 *
 * So CSS: nada de biblioteca, e `prefers-reduced-motion` desliga tudo.
 */

/** Posicoes fixas (em %) dos pontos que acendem. Constantes: nada de aleatorio no render. */
const PONTOS = [
  [22, 34], [31, 58], [44, 27], [52, 48], [61, 66], [68, 38], [74, 55], [38, 72], [57, 20], [81, 30], [16, 62], [47, 82],
] as const;

export function MapaCarregando({ texto = 'Montando o mapa' }: { texto?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#eef3f7]"
    >
      {/* Malha do "mapa" */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(#d5e0ea 1px, transparent 1px), linear-gradient(90deg, #d5e0ea 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
      />

      {/* Pontos acendendo, cada um no seu tempo */}
      {PONTOS.map(([x, y], i) => (
        <span
          key={i}
          aria-hidden="true"
          className="absolute size-2.5 rounded-full bg-brand-700 shadow-[0_0_0_4px_rgb(31_78_109/0.15)]"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            animation: `cmd-ponto-acende 2.4s ease-in-out ${(i * 0.19).toFixed(2)}s infinite both`,
          }}
        />
      ))}

      {/* Radar */}
      <div aria-hidden="true" className="relative size-44">
        <span className="absolute inset-0 rounded-full border border-brand-700/20" />
        <span className="absolute inset-6 rounded-full border border-brand-700/20" />
        <span className="absolute inset-12 rounded-full border border-brand-700/25" />
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, rgb(31 78 109 / 0.35), rgb(31 78 109 / 0) 70deg)',
            animation: 'cmd-radar 2s linear infinite',
          }}
        />
        <span
          className="absolute inset-0 rounded-full border-2 border-brand-700/40"
          style={{ animation: 'cmd-onda 2s ease-out infinite' }}
        />
        <span className="absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-700 shadow-[0_0_0_6px_rgb(31_78_109/0.18)]" />
      </div>

      <p className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-pill bg-surface/90 px-3 py-1.5 text-xs font-semibold text-brand-800 shadow-card backdrop-blur">
        {texto}
        <span aria-hidden="true" className="inline-block w-4 text-left">
          <span style={{ animation: 'carregando-ponto 1.2s infinite' }}>...</span>
        </span>
      </p>
    </div>
  );
}
