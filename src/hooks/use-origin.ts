'use client';

import { useSyncExternalStore } from 'react';

/** Assinatura vazia: a origem nao muda durante a vida da pagina. */
const subscribe = () => () => {};

/**
 * Origem absoluta da aplicacao (ex.: https://exemplo.com).
 * Retorna vazio no servidor, evitando divergencia na hidratacao.
 */
export function useOrigin(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => '',
  );
}
