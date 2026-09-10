import type { IsoDate } from './common';

export interface Invite {
  /**
   * Token opaco usado na rota publica. Nao contem dado pessoal.
   *
   * O banco guarda apenas o hash SHA-256: o valor original existe somente no
   * link. Por isso vem preenchido apenas quando o convite acabou de ser criado
   * ou renovado, e na propria rota publica (onde o visitante ja tem o token).
   */
  token: string | null;
  active: boolean;
  createdAt: IsoDate;
  /** Momento da ultima geracao de token. */
  rotatedAt: IsoDate | null;
}

export type InviteStatus = 'valid' | 'disabled' | 'not-found';
