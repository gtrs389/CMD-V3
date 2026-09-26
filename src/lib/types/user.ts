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
  email: string | null;
  role: Role;
  createdAt: IsoDate;
}

/**
 * Estado do acesso mostrado ao ADMIN em Configuracoes.
 *
 * Quem entra por link do time + telefone (Administrador do time e membro da
 * equipe) depende do telefone: sem numero nao ha como identificar a pessoa, e
 * com o numero repetido dentro do mesmo time o acesso fica bloqueado ate o
 * ADMIN geral corrigir — o sistema nunca escolhe entre duas pessoas.
 */
export const ACCESS_STATUSES = [
  'PENDING',
  'ACTIVE',
  'DISABLED',
  'NO_PHONE',
  'DUPLICATE_PHONE',
  /**
   * Pessoa ficticia de um Time DEMO.
   *
   * Nao e pendencia: ela foi criada de proposito SEM acesso, e nao existe
   * nada a resolver. Sem este estado, um cadastro de demonstracao aparecia
   * como "Acesso pendente" no meio de uma apresentacao — um alarme sobre um
   * problema que nao existe.
   */
  'DEMO_NO_ACCESS',
] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

export const ACCESS_STATUS_LABELS: Record<AccessStatus, string> = {
  PENDING: 'Acesso pendente',
  ACTIVE: 'Ativo',
  DISABLED: 'Desativado',
  NO_PHONE: 'Telefone necessário',
  DUPLICATE_PHONE: 'Telefone duplicado — corrija para liberar o acesso',
  DEMO_NO_ACCESS: 'Sem acesso — demonstração',
};

/**
 * Telefone ja usado por outra pessoa ativa do mesmo time.
 *
 * Unica mensagem do sistema para o caso: o servidor recusa com ela e a tela
 * publica a mostra no proprio campo Telefone. Em times diferentes o mesmo
 * numero pode existir, porque o link identifica o time antes do telefone.
 */
export const PHONE_IN_USE = 'Este telefone já está cadastrado neste time.';

/** Time que ainda nao possui nenhum administrador cadastrado. */
export interface CandidateWithoutAdmins {
  clientId: string;
  name: string;
  photo: string | null;
}

/**
 * Aparelho autorizado de quem entra por link do time + telefone, como o
 * ADMIN geral o ve: vale para o Administrador do time e para o membro da
 * equipe.
 *
 * Somente auditoria: nenhum identificador tecnico, hash de credencial ou
 * valor derivado de IP chega ao navegador.
 */
export interface AdminDeviceInfo {
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  platform: string | null;
  firstSeenAt: IsoDate;
  lastSeenAt: IsoDate;
}

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
  /** Historico: so o ADMIN geral ainda autentica por e-mail. */
  email: string | null;
  name: string;
  /** Telefone de acesso: Administrador do time e membro da equipe. */
  phone: string | null;
  /** Foto do administrador do time ou do integrante. */
  photo: string | null;
  role: Role;
  status: AccessStatus;
  /**
   * Time (operacao) do usuario. Nulo apenas no ADMIN.
   *
   * `isDemo` marca quem pertence a um Time DEMO: a tela exibe o selo ao lado
   * do nome, para ninguem confundir um acesso de demonstracao com um acesso
   * da operacao real.
   */
  candidate: { id: string; name: string; photo: string | null; isDemo: boolean } | null;
  /** Integrante correspondente. Preenchido somente no perfil EQUIPE. */
  memberId: string | null;
  /** Administrador do time correspondente. */
  teamPersonId: string | null;
  /**
   * Aparelho autorizado. Nulo enquanto nenhum navegador foi vinculado, e
   * sempre nulo no ADMIN geral, que nao usa essa regra.
   */
  device: AdminDeviceInfo | null;
  /** Quem cadastrou este usuario. Preenchido somente no perfil EQUIPE. */
  recruitedBy: Recruiter | null;
  lastLoginAt: IsoDate | null;
  mustChangePassword: boolean;
  createdAt: IsoDate;
  /** Marca a propria conta do ADMIN que esta consultando. */
  self: boolean;
}

/**
 * Integrante que ainda nao possui acesso liberado.
 *
 * O acesso nasce junto do cadastro. Fica de fora apenas quem nao tem
 * telefone (`NO_PHONE`) ou cujo telefone se repete dentro do time
 * (`DUPLICATE_PHONE`): corrigido o numero, o acesso e criado ou liberado.
 */
export interface MemberWithoutAccess {
  memberId: string;
  clientId: string;
  candidateName: string;
  name: string;
  phone: string | null;
  photo: string | null;
  status: AccessStatus;
  recruitedBy: Recruiter | null;
}

/**
 * Credencial gerada agora. Exclusiva do ADMIN geral: nenhum outro perfil
 * possui senha.
 *
 * Existe apenas na resposta da acao e no estado temporario do modal: nao e
 * gravada em banco, log, URL ou armazenamento do navegador.
 */
export interface GeneratedCredential {
  userId: string;
  name: string;
  email: string | null;
  password: string;
}

/** Sessao autenticada, sem dados sensiveis. */
export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  /** Foto do Administrador do time, quando houver. */
  photo?: string | null;
  role: Role;
  /** Operacao do usuario. Preenchido em CANDIDATE e em EQUIPE. */
  candidateId: string | null;
  /** Integrante correspondente. Preenchido somente no perfil EQUIPE. */
  memberId: string | null;
  /** Senha temporaria em uso: apenas o primeiro acesso fica liberado. */
  mustChangePassword: boolean;
  /**
   * ADMIN geral que abriu esta sessao no painel desta pessoa (migration
   * 045). Nulo em toda sessao normal — que e o caso de todas, menos as
   * poucas abertas de proposito pelo painel do ADMIN.
   *
   * Quem esta na tela e a PESSOA: nome, perfil, alcance e permissoes sao os
   * dela. Este campo existe para dois fins, e nenhum deles e ampliar
   * acesso: a faixa fixa que avisa de quem e o painel, e a verdade do
   * historico — o link gerado durante a visita fica registrado como gerado
   * pelo ADMIN, em nome dela.
   */
  impersonatedBy?: string | null;
}
