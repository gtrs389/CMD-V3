import type { FieldResponse } from '@/lib/types';
import { api } from './api';

/**
 * Envio do formulario publico.
 *
 * O cliente de destino vem do token do link, resolvido no servidor.
 * O navegador nunca escolhe para qual cliente o cadastro vai.
 */
export interface PublicSubmission {
  name: string;
  phone: string;
  photo: string | null;
  responses: FieldResponse[];
  consentAt: string | null;
}

export async function submitInvite(token: string, input: PublicSubmission): Promise<void> {
  await api<{ ok: true }>(`/api/public/convite/${encodeURIComponent(token)}/membros`, {
    method: 'POST',
    body: input,
  });
}
