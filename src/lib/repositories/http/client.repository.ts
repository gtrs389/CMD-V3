import type {
  Client,
  ClientFormConfig,
  ClientInput,
  ClientSummary,
  TeamAccessLinks,
} from '@/lib/types';
import { NotFoundError, type ClientCreation, type ClientRepository } from '../types';
import { notifyDataChanged } from '../events';
import { api } from './api';

/**
 * `ClientRepository` sobre as rotas de API do Next.js.
 * A fonte oficial dos dados e o Supabase, acessado somente no servidor.
 */
export function createHttpClientRepository(): ClientRepository {
  async function mutate(path: string, method: 'POST' | 'PATCH', body?: unknown): Promise<Client> {
    const { client } = await api<{ client: Client }>(path, { method, body });
    notifyDataChanged();
    return client;
  }

  return {
    async list() {
      const { clients } = await api<{ clients: ClientSummary[] }>('/api/clients');
      return clients;
    },

    async listSummaries(options) {
      // A pagina "Times" pede os DEMO junto; o painel e o resto do sistema
      // recebem somente os times reais.
      const query = options?.includeDemo ? '?demo=incluir' : '';
      const { clients } = await api<{ clients: ClientSummary[] }>(`/api/clients${query}`);
      return clients;
    },

    async getById(id) {
      try {
        const { client } = await api<{ client: Client }>(`/api/clients/${id}`);
        return client;
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async create(input: ClientInput): Promise<ClientCreation> {
      const data = await api<{ client: Client; accessLinks: TeamAccessLinks | null }>('/api/clients', {
        method: 'POST',
        body: input,
      });

      notifyDataChanged();
      return { client: data.client, accessLinks: data.accessLinks ?? null };
    },

    async update(id, input) {
      return mutate(`/api/clients/${id}`, 'PATCH', input);
    },

    async remove(id) {
      await api(`/api/clients/${id}`, { method: 'DELETE' });
      notifyDataChanged();
    },

    async updateForm(id, form: Partial<Omit<ClientFormConfig, 'updatedAt'>>) {
      return mutate(`/api/clients/${id}/form`, 'PATCH', form);
    },

    async setInviteActive(id, active) {
      return mutate(`/api/clients/${id}/invite`, 'PATCH', { active });
    },

    async regenerateInviteToken(id) {
      return mutate(`/api/clients/${id}/invite`, 'POST');
    },
  };
}

/**
 * Gera o link de cadastro do TIME e devolve o endereco pronto.
 *
 * O endereco vem montado do servidor, com o dominio publico: quem gera o
 * link esta no painel, e o painel nao e o endereco que se divulga.
 *
 * Separada de `clientRepository` porque a interface do repositorio devolve
 * o time, e aqui interessa tambem o endereco.
 */
export async function regenerateTeamInvite(
  id: string,
): Promise<{ client: Client; url: string | null }> {
  const resposta = await api<{ client: Client; url: string | null }>(
    `/api/clients/${id}/invite`,
    { method: 'POST' },
  );
  notifyDataChanged();
  return resposta;
}
