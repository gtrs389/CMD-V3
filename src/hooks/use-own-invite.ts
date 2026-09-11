'use client';

import { useCallback, useState } from 'react';
import { notifyDataChanged } from '@/lib/repositories';
import { api } from '@/lib/repositories/http/api';

/**
 * Geracao do PROPRIO link de recrutamento.
 *
 * O time e o integrante podem gerar ou renovar o link deles, mas nunca
 * escolhem a duracao: o prazo vem da configuracao do ADMIN e e aplicado no
 * servidor. Gerar um link novo revoga o anterior na hora.
 */
export function useOwnInviteRenewal() {
  const [renewing, setRenewing] = useState(false);

  const renew = useCallback(async (): Promise<boolean> => {
    setRenewing(true);
    try {
      await api<{ token: string }>('/api/convite/renovar', { method: 'POST' });
      // O painel recarrega e passa a mostrar o link e o prazo novos.
      notifyDataChanged();
      return true;
    } catch {
      return false;
    } finally {
      setRenewing(false);
    }
  }, []);

  return { renew, renewing };
}
