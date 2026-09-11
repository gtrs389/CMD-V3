import type { Role, SessionUser } from '@/lib/types';

/**
 * Camada central de permissoes.
 *
 * Toda verificacao de acesso do sistema passa por aqui. Permissao sozinha
 * nunca basta: as rotas que recebem um identificador conferem tambem o
 * escopo da sessao (`canReachClient`, `canReachMemberRow`), porque esconder
 * botao nao protege nada.
 */

export const PERMISSIONS = [
  'admin.access',
  /** Abre o painel: ADMIN, CANDIDATE e EQUIPE. */
  'panel.access',
  'dashboard.view',
  /** Lista de todos os candidatos: exclusivo do ADMIN. */
  'client.list',
  'client.view',
  'client.create',
  'client.update',
  'client.delete',
  /** Area interna do formulario (ver e administrar): exclusiva do ADMIN. */
  'form.view',
  'form.manage',
  'invite.view',
  'invite.manage',
  'member.view',
  'member.create',
  'member.update',
  'member.delete',
  /** Pagina "Minha mobilizacao": exclusiva do perfil EQUIPE. */
  'team.access',
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
 * Integrante da equipe: leitura, e sempre restrita a quem ele mesmo
 * cadastrou. Nao edita candidato, integrante nem convite, e nao ativa,
 * desativa ou renova o proprio link.
 *
 * A area interna do formulario fica inteiramente fora: sem `form.view` nao
 * ha aba, cartao, previa nem configuracao de campos, e as rotas recusam com
 * 403. O link pessoal continua disponivel para copiar e compartilhar.
 */
const EQUIPE_PERMISSIONS: readonly Permission[] = [
  'panel.access',
  'team.access',
  'member.view',
  'invite.view',
  'invite.submit',
];

/**
 * Candidato: leitura apenas, e sempre da propria operacao.
 *
 * Enxerga toda a equipe, em qualquer nivel, porque o vinculo e o candidato.
 *
 * A area interna do formulario e do ADMIN: sem `form.view` o candidato nao
 * ve aba, cartao, contagem de campos nem previa, e a configuracao dos campos
 * nao chega nem ao navegador.
 */
const CANDIDATE_PERMISSIONS: readonly Permission[] = [
  'panel.access',
  'client.view',
  'member.view',
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
 * Conferencia de escopo por candidato (operacao).
 *
 * ADMIN alcanca qualquer registro. CANDIDATE alcanca somente a propria
 * operacao. EQUIPE nunca alcanca o registro do candidato: a pagina dela e
 * "Minha mobilizacao", montada a partir dos proprios recrutados.
 */
export function canReachClient(
  user: Pick<SessionUser, 'role' | 'candidateId'> | null | undefined,
  clientId: string | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return can(user, 'client.view');
  if (user.role === 'CANDIDATE') return Boolean(clientId) && user.candidateId === clientId;
  return false;
}

/** Dados minimos do integrante necessarios para decidir o acesso. */
export interface MemberScope {
  clientId: string;
  /** Dono do link usado no cadastro. */
  recruitedByUserId: string | null;
}

/**
 * Regra unica da hierarquia, aplicada em paginas, rotas, servicos e
 * consultas.
 *
 * ADMIN      alcanca qualquer integrante.
 * CANDIDATE  alcanca qualquer integrante da propria operacao, em qualquer
 *            nivel: cadastrados por ele e por qualquer membro da equipe.
 * EQUIPE     alcanca somente quem se cadastrou pelo proprio link. Irmaos,
 *            pessoas de outro recrutador, descendentes dos proprios
 *            recrutados e outra candidatura ficam de fora.
 */
export function canReachMember(
  user: Pick<SessionUser, 'id' | 'role' | 'candidateId'> | null | undefined,
  member: MemberScope | null | undefined,
): boolean {
  if (!user || !member) return false;
  if (user.role === 'ADMIN') return true;
  if (user.candidateId !== member.clientId) return false;
  if (user.role === 'CANDIDATE') return true;
  if (user.role === 'EQUIPE') return member.recruitedByUserId === user.id;
  return false;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  EQUIPE: 'Equipe',
  CANDIDATE: 'Candidato',
};

/** Rotulo curto usado ao lado do nome em "Cadastrado por". */
export const ROLE_SHORT_LABELS: Record<Role, string> = {
  ADMIN: 'Administração',
  EQUIPE: 'Equipe',
  CANDIDATE: 'Candidato',
};
