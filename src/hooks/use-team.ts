'use client';

import { useCallback } from 'react';
import type { TeamOverview } from '@/lib/types';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from './use-repository-query';

/**
 * Dados da pagina "Minha mobilizacao".
 *
 * A rota nao recebe parametro nenhum: o integrante e a operacao saem da
 * sessao, no servidor.
 */
export function useTeamOverview() {
  const loader = useCallback(
    async () => (await api<{ overview: TeamOverview }>('/api/equipe')).overview,
    [],
  );
  return useRepositoryQuery<TeamOverview>(loader);
}
