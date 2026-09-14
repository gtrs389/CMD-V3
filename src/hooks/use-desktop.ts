'use client';

import { useSyncExternalStore } from 'react';
import { breakpoints } from '@/config/theme';

/**
 * A tela e larga o bastante para a coluna lateral (>= lg)?
 *
 * O mapa mostra a mesma coluna em dois lugares: ao lado do mapa no desktop e
 * abaixo dele no celular. Para o RANKING isso nao custa nada — os dois
 * existem e o CSS esconde um. Para a FICHA custa: cada copia buscaria o
 * integrante no servidor, e seriam duas requisicoes iguais a cada abertura.
 * Este gancho decide, no navegador, em qual dos dois lugares a ficha nasce.
 *
 * No servidor a resposta e `false`: nenhuma ficha esta aberta no primeiro
 * desenho, entao nao ha o que piscar na hidratacao.
 */
const QUERY = `(min-width: ${breakpoints.lg}px)`;

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
