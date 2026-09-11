import type { Role, SessionUser } from '@/lib/types';

/**
 * Camada central de permissoes.
 *
 * Toda verificacao de acesso do sistema passa por aqui. Para liberar o painel
 * ao perfil EQUIPE no futuro, basta acrescentar as permissoes na matriz abaixo
 * — nenhuma tela precisa ser alterada.
 */

export const PERMISSIONS = [
  'admin.access',
  'dashboard.view',
  'client.view',
  'client.create',
  'client.update',
  'client.delete',
  'form.view',
  'form.manage',
  'invite.view',
  'invite.manage',
  'member.view',
  'member.create',
  'member.update',
  'member.delete',
  /** Resultado da verificacao cadastral: exclusivo do ADMIN. */
  'verification.view',
  'verification.retry',
  /** Mapa da mobilizacao: exclusivo do ADMIN. */
  'map.view',
  'map.resolve',
  /** Envio pelo link publico: nao exige autenticacao. */
  'invite.submit',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ADMIN_PERMISSIONS: readonly Permission[] = PERMISSIONS;

/**
 * Nesta etapa o perfil EQUIPE ainda nao possui login nem painel.
 * Ele existe na estrutura e recebe apenas o envio pelo formulario publico.
 */
const EQUIPE_PERMISSIONS: readonly Permission[] = ['invite.submit'];

const MATRIX: Record<Role, readonly Permission[]> = {
  ADMIN: ADMIN_PERMISSIONS,
  EQUIPE: EQUIPE_PERMISSIONS,
};

/** Permissoes disponiveis para quem nao esta autenticado (visitante do convite). */
const ANONYMOUS_PERMISSIONS: readonly Permission[] = ['invite.submit'];

export function permissionsOf(role: Role | null | undefined): readonly Permission[] {
  if (!role) return ANONYMOUS_PERMISSIONS;
  return MATRIX[role] ?? ANONYMOUS_PERMISSIONS;
}

export function can(
  user: Pick<SessionUser, 'role'> | null | undefined,
  permission: Permission,
): boolean {
  return permissionsOf(user?.role).includes(permission);
}

/** Perfis que podem abrir qualquer rota administrativa. */
export function hasPanelAccess(user: Pick<SessionUser, 'role'> | null | undefined): boolean {
  return can(user, 'admin.access');
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  EQUIPE: 'Equipe',
};
