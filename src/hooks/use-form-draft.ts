'use client';

import { useCallback, useEffect, useRef } from 'react';
import { STORAGE_KEYS } from '@/lib/repositories/local/storage';

/**
 * Preserva temporariamente o preenchimento de um formulario publico.
 *
 * Evita perda acidental se a pessoa sair da pagina ou o navegador recarregar.
 * O rascunho e apagado assim que o cadastro e enviado.
 */
export function useFormDraft<T extends Record<string, unknown>>(key: string) {
  const storageKey = `${STORAGE_KEYS.drafts}${key}`;
  const timer = useRef<number | null>(null);

  const read = useCallback((): Partial<T> | null => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as Partial<T>) : null;
    } catch {
      return null;
    }
  }, [storageKey]);

  const save = useCallback(
    (values: T) => {
      if (typeof window === 'undefined') return;
      if (timer.current) window.clearTimeout(timer.current);

      timer.current = window.setTimeout(() => {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(values));
        } catch {
          // Rascunho e melhoria de experiencia: falhar aqui nao pode travar o envio.
        }
      }, 400);
    },
    [storageKey],
  );

  const clear = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (timer.current) window.clearTimeout(timer.current);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignorado.
    }
  }, [storageKey]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  return { read, save, clear };
}
