'use client';

import { useCallback } from 'react';
import type { MemberDevice } from '@/lib/domain/device-summary';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from './use-repository-query';

/** Aparelhos registrados de um integrante. Rota protegida do ADMIN. */
export function useMemberDevices(memberId: string | null) {
  const loader = useCallback(async (): Promise<MemberDevice[]> => {
    if (!memberId) return [];
    const { devices } = await api<{ devices: MemberDevice[] }>(
      `/api/members/${memberId}/devices`,
    );
    return devices;
  }, [memberId]);

  return useRepositoryQuery<MemberDevice[]>(loader);
}
