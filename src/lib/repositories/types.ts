import type {
  Client,
  ClientFormConfig,
  ClientInput,
  ClientSummary,
  Member,
  MemberInput,
  TeamAccessLinks,
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
 * Os dois enderecos de acesso nascem junto com o time e voltam aqui para o
 * ADMIN geral copiar e enviar: um para os Administradores do time, outro
 * para a equipe. Nao ha senha em nenhum dos dois — quem entra no painel usa
 * o endereco do seu publico mais o proprio telefone.
 */
export interface ClientCreation {
  client: Client;
  accessLinks: TeamAccessLinks | null;
}

/** Recorte da listagem de times. */
export interface ListSummariesOptions {
  /**
   * Inclui os Times DEMO. So a pagina "Times" do ADMIN geral pede: as demais
   * telas tratam de numero da operacao real.
   */
  includeDemo?: boolean;
}

export interface ClientRepository {
  list(): Promise<Client[]>;
  listSummaries(options?: ListSummariesOptions): Promise<ClientSummary[]>;
  getById(id: string): Promise<Client | null>;
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
