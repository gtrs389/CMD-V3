import type { IsoDate } from './common';

/**
 * Niveis de acesso previstos.
 *
 * ADMIN administra o sistema inteiro. CANDIDATE entra no painel e enxerga
 * somente o proprio registro. EQUIPE existe na estrutura para a expansao
 * futura e continua sem login.
 */
export const ROLES = ['ADMIN', 'EQUIPE', 'CANDIDATE'] as const;
export type Role = (typeof ROLES)[number];

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: IsoDate;
}

/** Estado do acesso mostrado ao ADMIN em Configuracoes. */
export const ACCESS_STATUSES = ['PENDING', 'ACTIVE', 'DISABLED'] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

export const ACCESS_STATUS_LABELS: Record<AccessStatus, string> = {
  PENDING: 'Acesso pendente',
  ACTIVE: 'Ativo',
  DISABLED: 'Desativado',
};

/** Linha da lista de usuarios do sistema. Nunca carrega hash de senha. */
export interface SystemUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: AccessStatus;
  /** Candidato vinculado, quando o perfil for CANDIDATE. */
  candidate: { id: string; name: string; photo: string | null } | null;
  lastLoginAt: IsoDate | null;
  mustChangePassword: boolean;
  createdAt: IsoDate;
  /** Marca a propria conta do ADMIN que esta consultando. */
  self: boolean;
}

/** Candidato que ainda nao possui usuario vinculado. */
export interface CandidateWithoutAccess {
  clientId: string;
  name: string;
  email: string;
  photo: string | null;
}

/**
 * Credencial gerada agora.
 *
 * Existe apenas na resposta da acao e no estado temporario do modal: nao e
 * gravada em banco, log, URL ou armazenamento do navegador.
 */
export interface GeneratedCredential {
  userId: string;
  name: string;
  email: string;
  password: string;
}

/** Sessao autenticada, sem dados sensiveis. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Candidato vinculado. Preenchido somente no perfil CANDIDATE. */
  candidateId: string | null;
  /** Senha temporaria em uso: apenas o primeiro acesso fica liberado. */
  mustChangePassword: boolean;
}
