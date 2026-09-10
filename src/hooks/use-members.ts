'use client';

import { useCallback } from 'react';
import { memberRepository } from '@/lib/repositories';
import type { Member } from '@/lib/types';
import { useRepositoryQuery } from './use-repository-query';

export function useMembers(clientId: string) {
  const loader = useCallback(() => memberRepository.listByClient(clientId), [clientId]);
  return useRepositoryQuery<Member[]>(loader);
}

export function useAllMembers() {
  const loader = useCallback(() => memberRepository.listAll(), []);
  return useRepositoryQuery<Member[]>(loader);
}
