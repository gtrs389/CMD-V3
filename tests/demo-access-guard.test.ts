import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Concessao de acesso a integrante, com Time DEMO no caminho.
 *
 * A regra: em um Time DEMO, quem entra no painel sao apenas os
 * administradores que o ADMIN geral cadastrou a mao. Integrante nao recebe
 * usuario — nem o ficticio da criacao, nem quem se cadastrar pelo link
 * durante uma demonstracao.
 *
 * A recusa vive em `createMemberAccess`, que e por onde TODO caminho de
 * concessao passa: cadastro pelo painel, envio do formulario publico e
 * sincronizacao do acesso quando o telefone muda. E por isso que o teste
 * olha esta funcao, e nao cada rota: recusar em uma rota e esquecer de outra
 * seria conceder acesso pela porta esquecida.
 *
 * Time REAL continua funcionando exatamente como antes.
 */

const TIME_DEMO = 'time-demo';
const TIME_REAL = 'time-real';

const inseridos: { tabela: string; valor: Record<string, unknown> }[] = [];
const convites: string[] = [];

vi.mock('@/lib/supabase/rest', () => ({
  selectRows: async (table: string, options: { filters?: Record<string, string> }) => {
    const filters = options.filters ?? {};
    if (table === 'cmd_clients') {
      // Responde como o banco: so devolve linha quando o time e DEMO.
      const id = String(filters.id ?? '').replace('eq.', '');
      return filters.is_demo === 'is.true' && id === TIME_DEMO ? [{ id }] : [];
    }
    return [];
  },
  selectOne: async () => null,
  insertOne: async (table: string, valor: Record<string, unknown>) => {
    inseridos.push({ tabela: table, valor });
    return { id: 'user-novo' };
  },
  insertRows: async () => [],
  updateRows: async () => [],
  deleteRows: async () => [],
  callFunction: async () => null,
  inFilter: (values: readonly string[]) => `in.(${values.join(',')})`,
  notInFilter: (values: readonly string[]) => `not.in.(${values.join(',')})`,
}));

vi.mock('@/lib/server/invite.service', () => ({
  ensurePersonalInvite: async (userId: string) => {
    convites.push(userId);
    return { id: 'invite-1' };
  },
}));

const { createMemberAccess } = await import('@/lib/server/user.service');

beforeEach(() => {
  inseridos.length = 0;
  convites.length = 0;
});

describe('acesso de integrante', () => {
  it('não cria usuário nem convite para integrante de Time DEMO', async () => {
    const resultado = await createMemberAccess({
      clientId: TIME_DEMO,
      memberId: 'mem-demo',
      name: 'Pessoa Fictícia',
      phone: '11980000001',
    });

    expect(resultado).toBeNull();
    expect(inseridos).toHaveLength(0);
    expect(convites).toHaveLength(0);
  });

  it('continua criando o acesso normalmente em um Time real', async () => {
    const resultado = await createMemberAccess({
      clientId: TIME_REAL,
      memberId: 'mem-real',
      name: 'Pessoa Real',
      phone: '11988887777',
    });

    expect(resultado).toBe('user-novo');

    const usuario = inseridos.find((item) => item.tabela === 'cmd_users');
    expect(usuario?.valor).toMatchObject({
      role: 'EQUIPE',
      client_id: TIME_REAL,
      member_id: 'mem-real',
      is_active: true,
      // Sem e-mail e sem senha, como sempre foi: entra por link + telefone.
      email: null,
      password_hash: null,
    });

    // O link pessoal de recrutamento continua nascendo junto.
    expect(convites).toEqual(['user-novo']);
  });
});
