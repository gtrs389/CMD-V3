import type { IsoDate } from './common';

/**
 * Niveis de acesso previstos.
 * Nesta etapa somente ADMIN possui login e painel.
 * EQUIPE existe na estrutura para a expansao futura.
 */
export const ROLES = ['ADMIN', 'EQUIPE'] as const;
export type Role = (typeof ROLES)[number];

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: IsoDate;
}

/** Sessao autenticada, sem dados sensiveis. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}
