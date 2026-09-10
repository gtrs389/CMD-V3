import type { IsoDate, StoredImage, Timestamped } from './common';
import type { ClientFormConfig } from './form-field';
import type { Invite } from './invite';

export interface Client extends Timestamped {
  id: string;
  name: string;
  email: string;
  photo: StoredImage | null;
  notes: string;
  invite: Invite;
  form: ClientFormConfig;
}

export interface ClientInput {
  name: string;
  email: string;
  photo: StoredImage | null;
  notes: string;
}

/** Cliente enriquecido com dados agregados para listagens. */
export interface ClientSummary extends Client {
  memberCount: number;
  lastMemberAt: IsoDate | null;
}
