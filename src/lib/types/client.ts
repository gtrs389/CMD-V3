import type { IsoDate, StoredImage, Timestamped } from './common';
import type { ClientFormConfig } from './form-field';
import type { Invite } from './invite';

/**
 * Pessoa do time: registro interno do ADMIN, sem relacao com integrantes
 * recrutados pelo link (Member) nem com acesso ao sistema (User). Nunca
 * entra na hierarquia de recrutamento e nunca altera quem cadastrou um
 * integrante.
 */
export interface TeamPerson {
  id: string;
  name: string;
  /** Apenas digitos, sem mascara. */
  phone: string;
  photo: StoredImage | null;
}

/**
 * Pessoa do time enviada pelo formulario de criacao/edicao do time.
 * `id` ausente ou vazio indica uma pessoa nova; presente, uma existente.
 */
export interface TeamPersonInput {
  id?: string;
  name: string;
  phone: string;
  photo: StoredImage | null;
}

export interface Client extends Timestamped {
  id: string;
  name: string;
  email: string;
  photo: StoredImage | null;
  notes: string;
  invite: Invite;
  form: ClientFormConfig;
  /** Pessoas do time, na ordem em que foram cadastradas. */
  people: TeamPerson[];
}

export interface ClientInput {
  name: string;
  email: string;
  photo: StoredImage | null;
  notes: string;
  /** Ausente: as pessoas do time nao sao alteradas. */
  people?: TeamPersonInput[];
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
  /** Quantidade total de pessoas do time. */
  teamPeopleCount: number;
  /** Pessoas do time mais recentes, para a pilha de fotos do cartao. */
  teamPeoplePreview: ClientMemberPreview[];
}
