import { useId } from 'react';
import { cn } from '@/lib/utils/cn';

interface BrandMarkProps {
  className?: string;
  /**
   * Movimento da marca: o "M" se desenha ao aparecer, o brilho atravessa o
   * selo e o ponto dourado pulsa. Desligado nos lugares pequenos e repetidos.
   */
  animated?: boolean;
  title?: string;
}

/**
 * A marca do CMD.
 *
 * Um "M" de Mobilizacao desenhado como REDE: cada vertice e uma pessoa, e as
 * ligacoes sao a equipe que uma traz para a outra. Os dois picos sobem — a
 * mobilizacao crescendo —, e o ponto do meio e dourado: o voto, o mesmo ouro
 * de quem lidera na Sala de Apuracao.
 *
 * E SVG em linha, e nao arquivo: assim o traco anima, os gradientes nao
 * colidem entre duas marcas na mesma pagina (os ids vem do `useId`) e o selo
 * aparece igual sobre o azul-marinho da barra lateral e sobre o branco do
 * cabecalho do celular. A versao estatica (favicon) fica em `src/app/icon.svg`
 * e `public/brand/logo-mark.svg`, com o mesmo desenho.
 */
export function BrandMark({ className, animated = false, title = 'CMD' }: BrandMarkProps) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const fundo = `cmd-fundo-${raw}`;
  const luz = `cmd-luz-${raw}`;
  const ouro = `cmd-ouro-${raw}`;
  const brilho = `cmd-brilho-${raw}`;
  const recorte = `cmd-recorte-${raw}`;

  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label={title}
      className={cn('cmd-marca shrink-0', animated && 'cmd-marca--viva', className)}
    >
      <defs>
        <linearGradient id={fundo} x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4f9bff" />
          <stop offset="0.55" stopColor="#2563eb" />
          <stop offset="1" stopColor="#1e3a8a" />
        </linearGradient>
        <linearGradient id={luz} x1="24" y1="0" x2="24" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.32" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={ouro} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset="0.55" stopColor="#f2c14e" />
          <stop offset="1" stopColor="#e0a426" />
        </radialGradient>
        <linearGradient id={brilho} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={recorte}>
          <rect width="48" height="48" rx="13" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${recorte})`}>
        <rect width="48" height="48" fill={`url(#${fundo})`} />
        <rect width="48" height="26" fill={`url(#${luz})`} />
        {/* Orbita discreta: o alcance da rede. */}
        <circle cx="24" cy="27" r="17" fill="none" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="1.2" />
        {/* O brilho que atravessa o selo (so na marca viva). */}
        <g transform="rotate(18 24 24)">
          <rect className="cmd-marca__brilho" x="-30" y="-12" width="18" height="72" fill={`url(#${brilho})`} />
        </g>
      </g>

      {/* As ligacoes da rede: o "M". */}
      <path
        className="cmd-marca__traco"
        d="M11 34 L17.5 15 L24 27.5 L30.5 15 L37 34"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={100}
      />

      {/* As pessoas. */}
      <g fill="#ffffff">
        <circle className="cmd-marca__no" cx="11" cy="34" r="3.3" />
        <circle className="cmd-marca__no" cx="17.5" cy="15" r="3.3" />
        <circle className="cmd-marca__no" cx="30.5" cy="15" r="3.3" />
        <circle className="cmd-marca__no" cx="37" cy="34" r="3.3" />
      </g>

      {/* O voto: o ponto dourado do meio, com a onda que sai dele. */}
      <circle className="cmd-marca__onda" cx="24" cy="27.5" r="4.4" fill="none" stroke="#f2c14e" strokeWidth="1.4" />
      <circle cx="24" cy="27.5" r="4.4" fill={`url(#${ouro})`} stroke="#0f1e35" strokeOpacity="0.35" strokeWidth="0.8" />
    </svg>
  );
}
