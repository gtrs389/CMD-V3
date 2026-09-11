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
   * vez todos os links daquele candidato.
   */
  active: boolean;
  createdAt: IsoDate;
  /** Momento da ultima geracao de token. */
  rotatedAt: IsoDate | null;
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
