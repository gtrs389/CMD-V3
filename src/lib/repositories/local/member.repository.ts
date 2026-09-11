import type { Member, MemberInput } from '@/lib/types';
import { createId } from '@/lib/utils/id';
import { isValidEmail, normalizeEmail } from '@/lib/utils/email';
import { nowIso } from '@/lib/utils/date';
import { normalizePhone } from '@/lib/utils/phone';
import { NotFoundError, type MemberRepository } from '../types';
import { notifyDataChanged } from '../events';
import { STORAGE_KEYS, getStorage, type StorageDriver } from './storage';

function readMembers(storage: StorageDriver): Member[] {
  const raw = storage.read<Member[]>(STORAGE_KEYS.members);
  return Array.isArray(raw) ? raw : [];
}

function writeMembers(storage: StorageDriver, members: Member[]): void {
  storage.write(STORAGE_KEYS.members, members);
  notifyDataChanged();
}

/**
 * Implementacao de referencia de `MemberRepository` sobre armazenamento
 * chave/valor. Nao e mais a fonte oficial dos dados: serve de documentacao
 * executavel da regra de negocio e e o alvo dos testes.
 */
export function createLocalMemberRepository(
  storageFactory: () => StorageDriver = getStorage,
): MemberRepository {
  return {
    async listAll() {
      return readMembers(storageFactory());
    },

    async listByClient(clientId) {
      return readMembers(storageFactory()).filter((member) => member.clientId === clientId);
    },

    async countByClient() {
      const counts: Record<string, number> = {};
      for (const member of readMembers(storageFactory())) {
        counts[member.clientId] = (counts[member.clientId] ?? 0) + 1;
      }
      return counts;
    },

    async getById(id) {
      return readMembers(storageFactory()).find((member) => member.id === id) ?? null;
    },

    async create(input: MemberInput) {
      const storage = storageFactory();
      const members = readMembers(storage);
      const timestamp = nowIso();

      const member: Member = {
        id: createId('mbr'),
        clientId: input.clientId,
        name: input.name.trim(),
        phone: normalizePhone(input.phone),
        email: isValidEmail(input.email) ? normalizeEmail(input.email) : null,
        photo: input.photo ?? null,
        gender: input.gender ?? null,
        cpf: input.cpf ?? null,
        voterId: input.voterId ?? null,
        zone: input.zone ?? null,
        section: input.section ?? null,
        state: input.state ?? null,
        city: input.city ?? null,
        district: input.district ?? null,
        street: input.street ?? null,
        relationshipOptionId: input.relationshipOptionId ?? null,
        relationshipLabel: input.relationshipLabel ?? null,
        responses: input.responses ?? [],
        consentAt: input.consentAt ?? null,
        source: input.source,
        // A origem do cadastro e sempre decidida no servidor, pelo dono do
        // link: a implementacao local nao inventa responsavel.
        recruitedBy: null,
        access: isValidEmail(input.email) ? 'PENDING' : 'NO_EMAIL',
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      writeMembers(storage, [member, ...members]);
      return member;
    },

    async update(id, input) {
      const storage = storageFactory();
      const members = readMembers(storage);
      const current = members.find((member) => member.id === id);
      if (!current) throw new NotFoundError('Integrante não encontrado.');

      const updated: Member = {
        ...current,
        name: input.name?.trim() ?? current.name,
        phone: input.phone === undefined ? current.phone : normalizePhone(input.phone),
        email:
          input.email === undefined
            ? current.email
            : isValidEmail(input.email)
              ? normalizeEmail(input.email)
              : null,
        photo: input.photo === undefined ? current.photo : input.photo,
        responses: input.responses ?? current.responses,
        consentAt: input.consentAt === undefined ? current.consentAt : input.consentAt,
        updatedAt: nowIso(),
      };

      writeMembers(
        storage,
        members.map((member) => (member.id === id ? updated : member)),
      );
      return updated;
    },

    async remove(id) {
      const storage = storageFactory();
      const members = readMembers(storage);
      if (!members.some((member) => member.id === id)) {
        throw new NotFoundError('Integrante não encontrado.');
      }
      writeMembers(
        storage,
        members.filter((member) => member.id !== id),
      );
    },

    async removeByClient(clientId) {
      const storage = storageFactory();
      const members = readMembers(storage);
      const remaining = members.filter((member) => member.clientId !== clientId);
      const removed = members.length - remaining.length;
      if (removed > 0) writeMembers(storage, remaining);
      return removed;
    },
  };
}
