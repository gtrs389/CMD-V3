import type { Member, MemberInput } from '@/lib/types';
import { type MemberRepository } from '../types';
import { notifyDataChanged } from '../events';
import { api } from './api';

/** `MemberRepository` sobre as rotas de API do Next.js. */
export function createHttpMemberRepository(): MemberRepository {
  async function listAll(): Promise<Member[]> {
    const { members } = await api<{ members: Member[] }>('/api/members');
    return members;
  }

  async function listByClient(clientId: string): Promise<Member[]> {
    const { members } = await api<{ members: Member[] }>(`/api/clients/${clientId}/members`);
    return members;
  }

  return {
    listAll,

    listByClient,

    async countByClient() {
      const counts: Record<string, number> = {};
      for (const member of await listAll()) {
        counts[member.clientId] = (counts[member.clientId] ?? 0) + 1;
      }
      return counts;
    },

    async getById(id) {
      const members = await listAll();
      return members.find((member) => member.id === id) ?? null;
    },

    async create(input: MemberInput) {
      const { member } = await api<{ member: Member }>('/api/members', {
        method: 'POST',
        body: input,
      });
      notifyDataChanged();
      return member;
    },

    async update(id, input) {
      const { member } = await api<{ member: Member }>(`/api/members/${id}`, {
        method: 'PATCH',
        body: input,
      });
      notifyDataChanged();
      return member;
    },

    async remove(id) {
      await api(`/api/members/${id}`, { method: 'DELETE' });
      notifyDataChanged();
    },

    async removeByClient(clientId) {
      // A exclusao do cliente ja remove a equipe em cascata no banco.
      const members = await listByClient(clientId);
      for (const member of members) await api(`/api/members/${member.id}`, { method: 'DELETE' });
      if (members.length > 0) notifyDataChanged();
      return members.length;
    },
  };
}
