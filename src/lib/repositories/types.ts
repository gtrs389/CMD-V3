import type {
  Client,
  ClientFormConfig,
  ClientInput,
  ClientSummary,
  Member,
  MemberInput,
  TeamAccessLink,
} from '@/lib/types';

/**
 * Contratos de persistencia.
 *
 * As telas dependem apenas destas interfaces. A implementacao ativa fala com
 * as rotas de API do proprio Next.js (`./http`), que sao o unico caminho ate o
 * Supabase. A implementacao em `./local` continua existindo como referencia da
 * regra de negocio e e exercitada pelos testes.
 */

/**
 * Resultado do cadastro de um time.
 *
 * O link de acesso dos administradores nasce junto com o time e volta aqui
 * para o ADMIN geral copiar e enviar. Nao ha senha: quem entra no painel do
 * time usa este link mais o proprio telefone.
 */
export interface ClientCreation {
  client: Client;
  accessLink: TeamAccessLink | null;
}

export interface ClientRepository {
  list(): Promise<Client[]>;
  listSummaries(): Promise<ClientSummary[]>;
  getById(id: string): Promise<Client | null>;
  /** Busca pelo token opaco do convite (rota pública). */
  getByToken(token: string): Promise<Client | null>;
  create(input: ClientInput): Promise<ClientCreation>;
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
