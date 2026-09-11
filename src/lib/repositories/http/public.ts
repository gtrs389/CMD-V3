import type { Client, FieldResponse, PublicInviteOwner } from '@/lib/types';
import { collectDeviceSignals, type DeviceSignals } from '@/lib/utils/device';
import { api } from './api';

/**
 * Convite aberto pelo link publico.
 *
 * O formulario e a identificacao de quem convidou vem da mesma resposta,
 * resolvida no servidor a partir do token. `owner` traz apenas nome, foto e
 * perfil; nulo em convite legado, sem dono registrado.
 */
export interface PublicInvite {
  client: Client;
  owner: PublicInviteOwner | null;
}

/** Nulo quando o link nao existe ou nao aceita cadastro agora. */
export async function fetchPublicInvite(token: string): Promise<PublicInvite | null> {
  if (!token) return null;

  const { client, owner } = await api<{ client: Client | null; owner: PublicInviteOwner | null }>(
    `/api/public/convite/${encodeURIComponent(token)}`,
  );

  return client ? { client, owner: owner ?? null } : null;
}

/**
 * Envio do formulario publico.
 *
 * A operacao de destino e o responsavel pelo cadastro vem do token do link,
 * resolvidos no servidor. O navegador nunca escolhe para qual candidato o
 * cadastro vai nem quem aparece como responsavel.
 */
export interface PublicSubmission {
  name: string;
  /** Campo padrao obrigatorio: vira o login do integrante. */
  email: string;
  phone: string;
  photo: string | null;
  /** Campos padrao. Nulo quando a pessoa nao informou. */
  gender: string | null;
  cpf: string | null;
  voterId: string | null;
  state: string | null;
  city: string | null;
  district: string | null;
  street: string | null;
  relationshipOptionId: string | null;
  relationshipLabel: string | null;
  responses: FieldResponse[];
  consentAt: string | null;
}

/**
 * Acesso recem-criado do integrante.
 *
 * Existe apenas nesta resposta e no estado da tela de sucesso. Fechar ou
 * recarregar a pagina faz a senha desaparecer: ela nao e gravada em log,
 * URL, banco em texto puro, `localStorage` nem `sessionStorage`.
 */
export interface CreatedAccess {
  email: string;
  password: string;
}

export async function submitInvite(
  token: string,
  input: PublicSubmission,
): Promise<CreatedAccess | null> {
  // Sinais tecnicos do aparelho, apenas para seguranca. Se o navegador nao
  // expuser nada, o envio segue igual: `device` vai vazio.
  const device: DeviceSignals = collectDeviceSignals();

  const result = await api<{ ok: true; id: string; access: CreatedAccess | null }>(
    `/api/public/convite/${encodeURIComponent(token)}/membros`,
    { method: 'POST', body: { ...input, device } },
  );

  return result.access ?? null;
}
