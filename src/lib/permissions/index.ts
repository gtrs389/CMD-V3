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
  /** Lista de todos os times: exclusivo do ADMIN. */
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
  /** Gerar ou renovar o PROPRIO link. Quem escolhe a duracao e so o ADMIN. */
  'invite.renew',
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
  /**
   * Questionario do time (migration 023). Formulario proprio, separado do
   * cadastro: quem responde nao vira integrante.
   *
   * `survey.view`   ve a area do questionario e as respostas recebidas;
   * `survey.manage` monta as perguntas — exclusivo do ADMIN geral;
   * `survey.send`   gera o proprio link de uso unico para enviar.
   */
  'survey.view',
  'survey.manage',
  'survey.send',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ADMIN_PERMISSIONS: readonly Permission[] = PERMISSIONS;

/**
 * Integrante da equipe: leitura restrita a quem ele mesmo cadastrou, e um
 * unico poder de escrita.
 *
 * `member.create` existe pela mesma razao que no Administrador do time: nem
 * toda pessoa se cadastra sozinha pelo link, e ele precisa poder registrar
 * quem esta na frente dele. O cadastro fica com o nome dele em "Cadastrado
 * por" e no proprio time — o servidor resolve os dois pela SESSAO, e nao
 * pelo corpo da requisicao.
 *
 * Editar e excluir integrante continuam fora, como estavam.
 *
 * A area interna do formulario fica inteiramente fora: sem `form.view` nao
 * ha aba, cartao, previa nem configuracao de campos, e as rotas recusam com
 * 403. O link pessoal continua disponivel para copiar e compartilhar.
 */
const EQUIPE_PERMISSIONS: readonly Permission[] = [
  'panel.access',
  'team.access',
  'member.view',
  'member.create',
  'invite.view',
  'invite.renew',
  'invite.submit',
  'survey.view',
  'survey.send',
];

/**
 * Time: a propria operacao, com um unico poder de escrita.
 *
 * Enxerga toda a equipe, em qualquer nivel, porque o vinculo e o time.
 *
 * `member.create` existe porque nem toda pessoa se cadastra sozinha pelo
 * link: o Administrador do time precisa poder registrar alguem a mao, ali
 * na frente dele. O cadastro fica com o nome dele em "Cadastrado por", como
 * qualquer outro, e o alcance continua sendo so o proprio time —
 * `requireClientAccess` confere as duas coisas.
 *
 * Editar e excluir integrante continuam fora: corrigir um cadastro alheio e
 * apagar historico sao decisoes do ADMIN.
 *
 * A area interna do formulario tambem e do ADMIN: sem `form.view` o time nao
 * ve aba, cartao nem previa. O que ele recebe do formulario e apenas o
 * necessario para PREENCHER o cadastro manual — ver `form-visibility.ts`.
 *
 * O mapa entra apenas como leitura: `map.view` mostra os cadastros da
 * propria operacao — o servidor forca esse recorte, o `clientId` da URL nao
 * decide nada. `map.resolve` continua fora: localizar cadastro pendente
 * aciona consulta paga e e decisao do ADMIN.
 */
const CANDIDATE_PERMISSIONS: readonly Permission[] = [
  'panel.access',
  'client.view',
  'member.view',
  'member.create',
  'invite.view',
  'invite.renew',
  'map.view',
  'survey.view',
  'survey.send',
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
 * Conferencia de escopo por time (operacao).
 *
 * ADMIN alcanca qualquer registro. CANDIDATE alcanca somente a propria
 * operacao. EQUIPE nunca alcanca o registro do time: a pagina dela e
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
 *            recrutados e outro time ficam de fora.
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
  CANDIDATE: 'Administrador do time',
};

/** Rotulo curto usado ao lado do nome em "Cadastrado por". */
export const ROLE_SHORT_LABELS: Record<Role, string> = {
  ADMIN: 'Administração',
  EQUIPE: 'Equipe',
  CANDIDATE: 'Administração do time',
};
