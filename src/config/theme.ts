/**
 * Tokens que precisam ser lidos por codigo TypeScript.
 * Os tokens visuais (cores, raios, sombras, tipografia) ficam em
 * `src/app/globals.css`, para que possam ser trocados sem recompilar logica.
 */

export const motion = {
  /** Duracoes em milissegundos, espelhando as variaveis CSS. */
  fast: 120,
  base: 200,
  slow: 320,
} as const;

/** Espelha os breakpoints padrao usados nas media queries do projeto. */
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

/** Area de toque minima recomendada (px). */
export const MIN_TOUCH_TARGET = 44;
