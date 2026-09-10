import type {
  Client,
  ClientFormConfig,
  ClientInput,
  ClientSummary,
  Member,
  MemberInput,
} from '@/lib/types';

/**
 * Contratos de persistencia.
 *
 * As telas dependem apenas destas interfaces. A implementacao atual guarda os
 * dados no localStorage; para migrar para uma API + banco de dados basta criar
 * outra implementacao (ex.: `HttpClientRepository`) e trocar a fabrica em
 * `src/lib/repositories/index.ts`. Todos os metodos ja sao assincronos
 * justamente para permitir essa troca sem alterar componentes.
 */

export interface ClientRepository {
  list(): Promise<Client[]>;
  listSummaries(): Promise<ClientSummary[]>;
  getById(id: string): Promise<Client | null>;
  /** Busca pelo token opaco do convite (rota publica). */
  getByToken(token: string): Promise<Client | null>;
  create(input: ClientInput): Promise<Client>;
  update(id: string, input: Partial<ClientInput>): Promise<Client>;
  remove(id: string): Promise<void>;

  updateForm(id: string, form: Partial<Omit<ClientFormConfig, 'updatedAt'>>): Promise<Client>;
  setInviteActive(id: string, active: boolean): Promise<Client>;
  regenerateInviteToken(id: string): Promise<Client>;
}

export interface MemberRepository {
  listAll(): Promise<Member[]>;
  listByClient(clientId: string): Promise<Member[]>;
  countByClient(): Promise<Record<string, number>>;
  getById(id: string): Promise<Member | null>;
  create(input: MemberInput): Promise<Member>;
  update(id: string, input: Partial<Omit<MemberInput, 'clientId'>>): Promise<Member>;
  remove(id: string): Promise<void>;
  removeByClient(clientId: string): Promise<number>;
}

export class RepositoryError extends Error {}
export class NotFoundError extends RepositoryError {}
export class StorageFullError extends RepositoryError {}
