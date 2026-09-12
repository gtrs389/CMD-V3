import type { InviteState } from '@/lib/domain/invite-expiration';
import type { InviteClickOutcome } from '@/lib/domain/invite-tracking';
import type { IsoDate } from './common';

export interface Invite {
  /**
   * Identificador opaco do link pessoal. Nao contem dado pessoal.
   *
   * Fica disponivel sempre que o dono do link consulta o proprio cadastro:
   * o link precisa sobreviver a logout, novo login, troca de aparelho e
   * recarregamento, e abrir a pagina publica nunca o gera, renova nem
   * invalida. Vem nulo apenas nos convites anteriores a migration 012, cujo
   * token so existia no link enviado.
   */
  token: string | null;
  /**
   * Recrutamento da operacao ligado. Desligado pelo ADMIN, derruba de uma
   * vez todos os links daquele time.
   */
  active: boolean;
  createdAt: IsoDate;
  /** Momento da ultima geracao de token. */
  rotatedAt: IsoDate | null;
  /** Estado do link (migration 013). */
  state: InviteState;
  /** Geracao do link, no horario do servidor. */
  issuedAt: IsoDate;
  /** Fim do prazo. A autorizacao e sempre do servidor, nunca do navegador. */
  expiresAt: IsoDate;
}

export type InviteStatus = 'valid' | 'disabled' | 'not-found';

/** Link pessoal de um integrante da equipe. */
export interface PersonalInvite {
  token: string | null;
  /** Link do proprio usuario ligado. */
  active: boolean;
  /** Recrutamento da operacao ligado pelo ADMIN. */
  operationActive: boolean;
}

/**
 * Dono do link, como a pagina publica de cadastro o exibe.
 *
 * Somente o necessario para a pessoa saber quem a convidou. Nada privado
 * passa por aqui: nem e-mail, nem identificador interno de usuario,
 * integrante ou operacao.
 */
export interface PublicInviteOwner {
  name: string;
  /** URL assinada da foto. Nulo quando nao ha foto: a tela usa as iniciais. */
  photoUrl: string | null;
  role: 'CANDIDATE' | 'EQUIPE';
}

/**
 * Duracao dos links, configurada pelo ADMIN.
 *
 * Dois prazos independentes, em segundos. Somente o ADMIN le e altera; a
 * conversao para intervalo acontece no banco, a partir do inteiro.
 */
export interface InviteExpirationSettings {
  candidateSeconds: number;
  teamSeconds: number;
  updatedAt: IsoDate;
}


/* -------------------------------------------------------------------------
   Rastreamento dos links de recrutamento (migration 020)
   ------------------------------------------------------------------------- */

/**
 * Aparelho do primeiro acesso, como o ADMIN geral o ve.
 *
 * Somente sinais tecnicos. O HMAC do IP, o hash do token e o segredo da
 * reserva ficam no servidor e nao existem neste formato.
 */
export interface InviteAccessDevice {
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  platform: string | null;
  userAgent: string | null;
  screenWidth: number | null;
  screenHeight: number | null;
  timezone: string | null;
  languages: string | null;
  maxTouchPoints: number | null;
  firstAccessAt: IsoDate;
}

/**
 * Pessoa cadastrada pelo link, exibida somente depois da conclusao.
 *
 * Apenas o basico para reconhecer quem se cadastrou e abrir a ficha: nada de
 * CPF, titulo de eleitor ou retorno de consulta cadastral.
 */
export interface InviteTrackingMember {
  id: string;
  clientId: string;
  name: string;
  phone: string;
  photoUrl: string | null;
}

/**
 * Uma abertura do link, como o ADMIN geral a ve (migration 021).
 *
 * Existe tambem para link expirado, reservado, consumido ou revogado. Nunca
 * carrega hash do IP, hash do token, segredo da reserva ou a URL do convite.
 */
export interface InviteClickEntry {
  id: string;
  /** Numero do clique humano. Nulo na pre-visualizacao automatica. */
  clickNumber: number | null;
  preview: boolean;
  occurredAt: IsoDate;
  /** Situacao do link no instante da abertura. */
  linkStatus: InviteState;
  outcome: InviteClickOutcome;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  platform: string | null;
  userAgent: string | null;
  screenWidth: number | null;
  screenHeight: number | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  timezone: string | null;
  languages: string | null;
  maxTouchPoints: number | null;
}

/**
 * Uma geracao de link no rastreamento.
 *
 * Todos os instantes e todas as duracoes vem do horario do banco. Nunca
 * carrega token, URL do convite, hash de IP, hash de token, segredo do
 * aparelho, CPF, titulo ou dado de consulta cadastral.
 */
export interface InviteTrackingEntry {
  /** Chave de lista: geracao do convite. */
  key: string;
  generation: number;
  /** Dono do link: a hierarquia que recebe o cadastro. */
  ownerName: string;
  ownerRole: 'ADMIN' | 'CANDIDATE' | 'EQUIPE' | null;
  clientId: string | null;
  clientName: string;
  /** Quem clicou para gerar ou renovar. Pode ser o ADMIN geral. */
  generatedByName: string;
  generatedByRole: 'ADMIN' | 'CANDIDATE' | 'EQUIPE' | null;
  generatedAt: IsoDate | null;
  expiresAt: IsoDate | null;
  firstAccessAt: IsoDate | null;
  consumedAt: IsoDate | null;
  expiredAt: IsoDate | null;
  revokedAt: IsoDate | null;
  state: InviteState;
  /** Geracao -> primeiro clique, em milissegundos. */
  msToFirstAccess: number | null;
  /** Primeiro clique -> conclusao, em milissegundos. */
  msToConsume: number | null;
  /** Geracao -> conclusao, em milissegundos. */
  msTotal: number | null;
  device: InviteAccessDevice | null;
  member: InviteTrackingMember | null;
  /** Todas as aberturas daquela geracao, da mais antiga para a mais nova. */
  clicks: InviteClickEntry[];
  /** Quantos cliques humanos. Pre-visualizacao automatica nao entra na conta. */
  humanClicks: number;
  firstClickAt: IsoDate | null;
  lastClickAt: IsoDate | null;
}
