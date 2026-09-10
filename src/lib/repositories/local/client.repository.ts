import type { Client, ClientFormConfig, ClientInput, ClientSummary, Member } from '@/lib/types';
import { createDefaultFormConfig } from '@/lib/domain/form-config';
import { createId, createInviteToken } from '@/lib/utils/id';
import { nowIso } from '@/lib/utils/date';
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

/**
 * Implementacao de `ClientRepository` sobre o localStorage.
 * Serve apenas a esta primeira etapa; a interface permanece a mesma
 * quando existir uma API real.
 */
export function createLocalClientRepository(
  storageFactory: () => StorageDriver = getStorage,
): ClientRepository {
  const load = () => readClients(storageFactory());

  function requireClient(clients: Client[], id: string): Client {
    const found = clients.find((client) => client.id === id);
    if (!found) throw new NotFoundError('Cliente nao encontrado.');
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

      return clients.map((client) => {
        const own = members.filter((member) => member.clientId === client.id);
        const lastMemberAt = own.reduce<string | null>((latest, member) => {
          if (!latest || member.createdAt > latest) return member.createdAt;
          return latest;
        }, null);
        return { ...client, memberCount: own.length, lastMemberAt };
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
        email: input.email.trim().toLowerCase(),
        photo: input.photo ?? null,
        notes: input.notes?.trim() ?? '',
        createdAt: timestamp,
        updatedAt: timestamp,
        invite: {
          token: createInviteToken(),
          active: true,
          createdAt: timestamp,
          rotatedAt: null,
        },
        form: createDefaultFormConfig(),
      };

      writeClients(storage, [client, ...clients]);
      return client;
    },

    async update(id, input) {
      return persist(id, (client) => ({
        ...client,
        name: input.name?.trim() ?? client.name,
        email: input.email?.trim().toLowerCase() ?? client.email,
        photo: input.photo === undefined ? client.photo : input.photo,
        notes: input.notes === undefined ? client.notes : input.notes.trim(),
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
