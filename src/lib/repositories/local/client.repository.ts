import type {
  Client,
  ClientFormConfig,
  ClientInput,
  ClientSummary,
  Member,
  TeamPerson,
  TeamPersonInput,
} from '@/lib/types';
import { createDefaultFormConfig } from '@/lib/domain/form-config';
import { DEFAULT_INVITE_SECONDS } from '@/lib/domain/invite-expiration';
import { createId, createInviteToken } from '@/lib/utils/id';
import { daysAgoIso, nowIso, startOfMonthIso } from '@/lib/utils/date';
import { NotFoundError, type ClientRepository } from '../types';
import { notifyDataChanged } from '../events';
import { STORAGE_KEYS, getStorage, type StorageDriver } from './storage';

function readClients(storage: StorageDriver): Client[] {
  const raw = storage.read<Client[]>(STORAGE_KEYS.clients);
  return Array.isArray(raw) ? raw : [];
}

function readMembers(storage: StorageDriver): Member[] {
  const raw = storage.read<Member[]>(STORAGE_KEYS.members);
  return Array.isArray(raw) ? raw : [];
}

function writeClients(storage: StorageDriver, clients: Client[]): void {
  storage.write(STORAGE_KEYS.clients, clients);
  notifyDataChanged();
}

/** Atribui um id definitivo as pessoas novas, preservando as existentes. */
function toTeamPeople(people: TeamPersonInput[]): TeamPerson[] {
  return people.map((person) => ({
    id: person.id ?? createId('per'),
    name: person.name.trim(),
    phone: person.phone,
    photo: person.photo ?? null,
  }));
}

/**
 * Implementacao de referencia de `ClientRepository` sobre armazenamento
 * chave/valor. Nao e mais a fonte oficial dos dados: serve de documentacao
 * executavel da regra de negocio e e o alvo dos testes.
 */
export function createLocalClientRepository(
  storageFactory: () => StorageDriver = getStorage,
): ClientRepository {
  const load = () => readClients(storageFactory());

  function requireClient(clients: Client[], id: string): Client {
    const found = clients.find((client) => client.id === id);
    if (!found) throw new NotFoundError('Time não encontrado.');
    return found;
  }

  function persist(id: string, mutate: (client: Client) => Client): Client {
    const storage = storageFactory();
    const clients = readClients(storage);
    const current = requireClient(clients, id);
    const updated = mutate(current);
    writeClients(
      storage,
      clients.map((client) => (client.id === id ? updated : client)),
    );
    return updated;
  }

  return {
    async list() {
      return load();
    },

    async listSummaries(): Promise<ClientSummary[]> {
      const storage = storageFactory();
      const clients = readClients(storage);
      const members = readMembers(storage);

      const monthStart = startOfMonthIso();
      const weekStart = daysAgoIso(7);

      return clients.map((client) => {
        const own = members
          .filter((member) => member.clientId === client.id)
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

        return {
          ...client,
          memberCount: own.length,
          lastMemberAt: own[0]?.createdAt ?? null,
          memberCountThisMonth: own.filter((member) => member.createdAt >= monthStart).length,
          memberCountLast7Days: own.filter((member) => member.createdAt >= weekStart).length,
          recentMembers: own.slice(0, 3).map((member) => ({
            id: member.id,
            name: member.name,
            photo: member.photo,
          })),
          teamPeopleCount: client.people.length,
          teamPeoplePreview: client.people.slice(0, 3).map((person) => ({
            id: person.id,
            name: person.name,
            photo: person.photo,
          })),
        };
      });
    },

    async getById(id) {
      return load().find((client) => client.id === id) ?? null;
    },

    async getByToken(token) {
      if (!token) return null;
      return load().find((client) => client.invite.token === token) ?? null;
    },

    async create(input: ClientInput) {
      const storage = storageFactory();
      const clients = readClients(storage);
      const timestamp = nowIso();

      const client: Client = {
        id: createId('cli'),
        name: input.name.trim(),
        // Legado: o cadastro nao pede mais e-mail do time.
        email: null,
        photo: input.photo ?? null,
        notes: input.notes?.trim() ?? '',
        createdAt: timestamp,
        updatedAt: timestamp,
        invite: {
          token: createInviteToken(),
          active: true,
          createdAt: timestamp,
          rotatedAt: null,
          // Referencia local: o prazo padrao do sistema e de 24 horas.
          state: 'ACTIVE',
          issuedAt: timestamp,
          expiresAt: new Date(Date.parse(timestamp) + DEFAULT_INVITE_SECONDS * 1000).toISOString(),
        },
        form: createDefaultFormConfig(),
        people: toTeamPeople(input.people ?? []),
      };

      writeClients(storage, [client, ...clients]);
      // A referencia local nao cria acesso: o link do time e os usuarios dos
      // administradores vivem apenas no servidor.
      return { client, accessLinks: null };
    },

    async update(id, input) {
      return persist(id, (client) => ({
        ...client,
        name: input.name?.trim() ?? client.name,
        photo: input.photo === undefined ? client.photo : input.photo,
        notes: input.notes === undefined ? client.notes : input.notes.trim(),
        people: input.people === undefined ? client.people : toTeamPeople(input.people),
        updatedAt: nowIso(),
      }));
    },

    async remove(id) {
      const storage = storageFactory();
      const clients = readClients(storage);
      requireClient(clients, id);
      writeClients(
        storage,
        clients.filter((client) => client.id !== id),
      );
    },

    async updateForm(id, form: Partial<Omit<ClientFormConfig, 'updatedAt'>>) {
      return persist(id, (client) => ({
        ...client,
        form: { ...client.form, ...form, updatedAt: nowIso() },
        updatedAt: nowIso(),
      }));
    },

    async setInviteActive(id, active) {
      return persist(id, (client) => ({
        ...client,
        invite: { ...client.invite, active },
        updatedAt: nowIso(),
      }));
    },

    async regenerateInviteToken(id) {
      return persist(id, (client) => ({
        ...client,
        invite: {
          ...client.invite,
          token: createInviteToken(),
          rotatedAt: nowIso(),
        },
        updatedAt: nowIso(),
      }));
    },
  };
}
