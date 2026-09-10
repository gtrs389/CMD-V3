'use client';

import { useCallback, useEffect, useState } from 'react';
import { subscribeToData } from '@/lib/repositories';

export interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

interface InternalState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

const INITIAL = { data: null, loading: true, error: null };

/**
 * Le dados de um repositorio e mantem a tela sincronizada.
 *
 * Reage as escritas feitas nesta aba e recarrega ao voltar o foco, para
 * refletir o que outra pessoa alterou no banco. O `loader` deve ser estavel
 * (envolvido em `useCallback` por quem chama); sua identidade define quando a
 * consulta e refeita.
 */
export function useRepositoryQuery<T>(loader: () => Promise<T>): QueryState<T> {
  const [state, setState] = useState<InternalState<T>>(INITIAL);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;

    loader()
      .then((result) => {
        if (active) setState({ data: result, loading: false, error: null });
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setState({
          data: null,
          loading: false,
          error: cause instanceof Error ? cause.message : 'Não foi possível carregar os dados.',
        });
      });

    return () => {
      active = false;
    };
  }, [loader, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => subscribeToData(reload), [reload]);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [reload]);

  return { ...state, reload };
}
