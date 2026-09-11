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
  /** Abre o painel: ADMIN e CANDIDATE. */
  'panel.access',
  'dashboard.view',
  /** Lista de todos os candidatos: exclusivo do ADMIN. */
  'client.list',
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
  /** Sinais tecnicos do aparelho: exclusivo do ADMIN. */
  'device.view',
  /** Configuracoes e usuarios do sistema: exclusivo do ADMIN. */
  'settings.view',
  'settings.manage',
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

/**
 * Candidato: leitura apenas, e sempre do proprio registro.
 *
 * A permissao nao basta. Toda rota que recebe um identificador confere
 * tambem o vinculo da sessao (`requireClientAccess`), entao um candidato
 * nunca alcanca o registro de outro.
 */
const CANDIDATE_PERMISSIONS: readonly Permission[] = [
  'panel.access',
  'client.view',
  'member.view',
  'form.view',
  'invite.view',
];

const MATRIX: Record<Role, readonly Permission[]> = {
  ADMIN: ADMIN_PERMISSIONS,
  EQUIPE: EQUIPE_PERMISSIONS,
  CANDIDATE: CANDIDATE_PERMISSIONS,
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

/** Perfis que podem abrir o painel. Cada rota ainda confere o proprio escopo. */
export function hasPanelAccess(user: Pick<SessionUser, 'role'> | null | undefined): boolean {
  return can(user, 'panel.access');
}

/**
 * Conferencia de escopo do candidato.
 *
 * ADMIN alcanca qualquer registro; CANDIDATE somente o proprio. Regra unica,
 * usada tanto nas rotas de API quanto nas paginas.
 */
export function canReachClient(
  user: Pick<SessionUser, 'role' | 'candidateId'> | null | undefined,
  clientId: string | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role !== 'CANDIDATE') return can(user, 'client.view');
  return Boolean(clientId) && user.candidateId === clientId;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  EQUIPE: 'Equipe',
  CANDIDATE: 'Candidato',
};
