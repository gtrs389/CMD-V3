import type { IsoDate } from './common';

export interface Invite {
  /** Token opaco usado na rota publica. Nao contem dado pessoal. */
  token: string;
  active: boolean;
  createdAt: IsoDate;
  /** Momento da ultima geracao de token. */
  rotatedAt: IsoDate | null;
}

export type InviteStatus = 'valid' | 'disabled' | 'not-found';
