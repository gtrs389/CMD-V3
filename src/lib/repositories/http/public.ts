import type { Client, FieldResponse, PublicInviteOwner } from '@/lib/types';
import { collectDeviceSignals, type DeviceSignals } from '@/lib/utils/device';
import { api, GoneError } from './api';

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

/**
 * Resultado de abrir o link.
 *
 * `gone` cobre expirado, ja usado, revogado e reservado por outro navegador:
 * o servidor responde 410 sem distinguir os casos, e a tela mostra sempre a
 * mesma mensagem. `unavailable` e o link inexistente ou com o recrutamento
 * desligado pela administracao.
 */
export type PublicInviteOutcome =
  | { kind: 'ready'; invite: PublicInvite; reason?: undefined }
  | { kind: 'gone'; reason: 'taken' | 'expired' }
  | { kind: 'unavailable'; reason?: undefined };

export async function fetchPublicInvite(token: string): Promise<PublicInviteOutcome> {
  if (!token) return { kind: 'unavailable' };

  try {
    const { client, owner } = await api<{ client: Client | null; owner: PublicInviteOwner | null }>(
      `/api/public/convite/${encodeURIComponent(token)}`,
    );

    if (!client) return { kind: 'unavailable' };
    return { kind: 'ready', invite: { client, owner: owner ?? null } };
  } catch (error) {
    if (error instanceof GoneError) return { kind: 'gone', reason: error.reason };
    throw error;
  }
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
 * Envio do cadastro.
 *
 * Nenhuma credencial volta do servidor: o integrante nasce com acesso
 * pendente e o ADMIN gera a senha temporaria em Configuracoes. A tela final
 * mostra apenas o agradecimento.
 */
export async function submitInvite(token: string, input: PublicSubmission): Promise<void> {
  // Sinais tecnicos do aparelho, apenas para seguranca. Se o navegador nao
  // expuser nada, o envio segue igual: `device` vai vazio.
  const device: DeviceSignals = collectDeviceSignals();

  await api<{ ok: true; id: string }>(
    `/api/public/convite/${encodeURIComponent(token)}/membros`,
    { method: 'POST', body: { ...input, device } },
  );
}
