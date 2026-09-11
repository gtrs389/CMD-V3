'use client';

import { useCallback, useState } from 'react';
import { notifyDataChanged } from '@/lib/repositories';
import { api } from '@/lib/repositories/http/api';

/** Resposta da rota ao gerar ou renovar o proprio link. */
export interface IssuedOwnInvite {
  token: string;
  issuedAt: string;
  expiresAt: string;
}

/**
 * Geracao do PROPRIO link de recrutamento.
 *
 * O time e o integrante podem gerar ou renovar o link deles, mas nunca
 * escolhem a duracao: o prazo vem da configuracao do ADMIN e e aplicado no
 * servidor. Gerar um link novo revoga o anterior na hora.
 */
export function useOwnInviteRenewal() {
  const [renewing, setRenewing] = useState(false);

  const renew = useCallback(async (): Promise<IssuedOwnInvite | null> => {
    setRenewing(true);
    try {
      const issued = await api<IssuedOwnInvite>('/api/convite/renovar', { method: 'POST' });
      // O painel recarrega e passa a mostrar o link e o prazo novos.
      notifyDataChanged();
      return issued;
    } catch {
      return null;
    } finally {
      setRenewing(false);
    }
  }, []);

  return { renew, renewing };
}
