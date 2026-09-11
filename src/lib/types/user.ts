import type { IsoDate } from './common';

/**
 * Niveis de acesso.
 *
 * ADMIN administra o sistema inteiro. CANDIDATE entra no painel e enxerga
 * toda a propria operacao, em qualquer nivel. EQUIPE e o integrante que se
 * cadastrou por um link: entra no painel e enxerga somente quem se cadastrou
 * pelo link dele.
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
export const ACCESS_STATUSES = ['PENDING', 'ACTIVE', 'DISABLED', 'NO_EMAIL'] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

export const ACCESS_STATUS_LABELS: Record<AccessStatus, string> = {
  PENDING: 'Acesso pendente',
  ACTIVE: 'Ativo',
  DISABLED: 'Desativado',
  NO_EMAIL: 'E-mail necessário',
};

/** Responsavel pelo cadastro, preservado mesmo se o usuario for excluido. */
export interface Recruiter {
  /** Nulo quando o usuario responsavel deixou de existir. */
  userId: string | null;
  name: string;
  role: Role;
  photo: string | null;
}

/** Linha da lista de usuarios do sistema. Nunca carrega hash de senha. */
export interface SystemUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: AccessStatus;
  /** Time (operacao) do usuario. Nulo apenas no ADMIN. */
  candidate: { id: string; name: string; photo: string | null } | null;
  /** Integrante correspondente. Preenchido somente no perfil EQUIPE. */
  memberId: string | null;
  /** Quem cadastrou este usuario. Preenchido somente no perfil EQUIPE. */
  recruitedBy: Recruiter | null;
  lastLoginAt: IsoDate | null;
  mustChangePassword: boolean;
  createdAt: IsoDate;
  /** Marca a propria conta do ADMIN que esta consultando. */
  self: boolean;
}

/** Time que ainda nao possui usuario vinculado. */
export interface CandidateWithoutAccess {
  clientId: string;
  name: string;
  email: string;
  photo: string | null;
}

/**
 * Integrante que ainda nao possui usuario.
 *
 * Com e-mail valido o ADMIN pode gerar o acesso; sem e-mail o estado fica
 * em `E-mail necessário` e nenhuma senha e criada.
 */
export interface MemberWithoutAccess {
  memberId: string;
  clientId: string;
  candidateName: string;
  name: string;
  email: string | null;
  photo: string | null;
  recruitedBy: Recruiter | null;
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
  /** Operacao do usuario. Preenchido em CANDIDATE e em EQUIPE. */
  candidateId: string | null;
  /** Integrante correspondente. Preenchido somente no perfil EQUIPE. */
  memberId: string | null;
  /** Senha temporaria em uso: apenas o primeiro acesso fica liberado. */
  mustChangePassword: boolean;
}
