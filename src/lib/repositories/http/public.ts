import type { FieldResponse } from '@/lib/types';
import { collectDeviceSignals, type DeviceSignals } from '@/lib/utils/device';
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
  /** Campos padrao. Nulo quando a pessoa nao informou. */
  gender: string | null;
  cpf: string | null;
  voterId: string | null;
  state: string | null;
  city: string | null;
  district: string | null;
  relationshipOptionId: string | null;
  relationshipLabel: string | null;
  responses: FieldResponse[];
  consentAt: string | null;
}

export async function submitInvite(token: string, input: PublicSubmission): Promise<void> {
  // Sinais tecnicos do aparelho, apenas para seguranca. Se o navegador nao
  // expuser nada, o envio segue igual: `device` vai vazio.
  const device: DeviceSignals = collectDeviceSignals();

  await api<{ ok: true }>(`/api/public/convite/${encodeURIComponent(token)}/membros`, {
    method: 'POST',
    body: { ...input, device },
  });
}
