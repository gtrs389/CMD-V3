'use client';

import { useCallback } from 'react';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from './use-repository-query';

/** Link de cadastro usado pelo integrante, como a rota devolve. */
export interface MemberSignupLink {
  /** Endereco completo. Nulo quando o link ja foi renovado depois do cadastro. */
  url: string | null;
  ownerName: string | null;
  generatedByName: string | null;
  generatedAt: string | null;
  consumedAt: string | null;
  generation: number;
}

/** Link de cadastro de um integrante. Rota protegida do ADMIN. */
export function useMemberSignupLink(memberId: string | null) {
  const loader = useCallback(async (): Promise<MemberSignupLink | null> => {
    if (!memberId) return null;
    const { link } = await api<{ link: MemberSignupLink | null }>(
      `/api/members/${memberId}/link`,
    );
    return link;
  }, [memberId]);

  return useRepositoryQuery<MemberSignupLink | null>(loader);
}
