import type { InviteState } from '@/lib/domain/invite-expiration';
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

/** Uma geracao de link no historico. Sem token, segredo, senha, CPF ou IP. */
export interface InviteHistoryEntry {
  /** Chave de lista: convite + geracao. */
  key: string;
  ownerName: string;
  ownerRole: 'ADMIN' | 'CANDIDATE' | 'EQUIPE' | null;
  candidateName: string;
  generatedAt: IsoDate | null;
  firstAccessAt: IsoDate | null;
  expiresAt: IsoDate | null;
  consumedAt: IsoDate | null;
  revokedAt: IsoDate | null;
  state: InviteState;
}
