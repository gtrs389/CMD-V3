'use client';

import { useCallback } from 'react';
import { clientRepository } from '@/lib/repositories';
import { fetchPublicInvite, type PublicInviteOutcome } from '@/lib/repositories/http/public';
import type { Client, ClientSummary } from '@/lib/types';
import { useRepositoryQuery } from './use-repository-query';

export function useClientSummaries() {
  const loader = useCallback(() => clientRepository.listSummaries(), []);
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
export function usePublicInvite(token: string) {
  const loader = useCallback(() => fetchPublicInvite(token), [token]);
  return useRepositoryQuery<PublicInviteOutcome>(loader);
}
