'use client';

import { useCallback } from 'react';
import { clientRepository } from '@/lib/repositories';
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

export function useClientByToken(token: string) {
  const loader = useCallback(() => clientRepository.getByToken(token), [token]);
  return useRepositoryQuery<Client | null>(loader);
}
