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

/** Integrante resumido, usado na pilha de fotos do cartao de cliente. */
export interface ClientMemberPreview {
  id: string;
  name: string;
  photo: StoredImage | null;
}

/** Cliente enriquecido com dados agregados para listagens. */
export interface ClientSummary extends Client {
  memberCount: number;
  lastMemberAt: IsoDate | null;
  /** Integrantes cadastrados no mes corrente. */
  memberCountThisMonth: number;
  /** Integrantes cadastrados nos ultimos sete dias. */
  memberCountLast7Days: number;
  /** Integrantes mais recentes (no maximo quatro), do mais novo ao mais antigo. */
  recentMembers: ClientMemberPreview[];
}
