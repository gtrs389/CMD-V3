'use client';

import { useSyncExternalStore } from 'react';

/** A resposta nunca muda depois da hidratacao. */
const subscribe = () => () => {};

/**
 * Indica que o JavaScript da pagina ja assumiu o controle.
 *
 * Usado para impedir o envio nativo de formularios renderizados no servidor
 * enquanto a hidratacao nao termina.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
