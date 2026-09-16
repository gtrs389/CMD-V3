'use client';

import { useCallback } from 'react';
import { clientRepository } from '@/lib/repositories';
import { fetchPublicInvite, type PublicInviteOutcome } from '@/lib/repositories/http/public';
import type { Client, ClientSummary } from '@/lib/types';
import { useRepositoryQuery } from './use-repository-query';

/**
 * Times para a tela.
 *
 * `includeDemo` e da pagina "Times": o ADMIN geral precisa ver o time de
 * demonstracao, com o selo, para abrir e apresentar. O painel usa o padrao,
 * sem DEMO, porque os cartoes dele somam a operacao real.
 */
export function useClientSummaries(options: { includeDemo?: boolean } = {}) {
  const { includeDemo = false } = options;
  const loader = useCallback(
    () => clientRepository.listSummaries({ includeDemo }),
    [includeDemo],
  );
  return useRepositoryQuery<ClientSummary[]>(loader);
}

export function useClient(id: string) {
  const loader = useCallback(() => clientRepository.getById(id), [id]);
  return useRepositoryQuery<Client | null>(loader);
}

/**
 * Convite aberto pelo link publico: formulario e quem convidou.
 *
 * A resposta vem da rota publica, que resolve o token no servidor. Nada e
 * guardado no navegador.
 */
export function usePublicInvite() {
  const loader = useCallback(() => fetchPublicInvite(), []);
  return useRepositoryQuery<PublicInviteOutcome>(loader);
}
