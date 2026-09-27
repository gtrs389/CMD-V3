import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Telefone repetido no time, vindo de PLANILHA.
 *
 * Cadastrando UMA pessoa, o numero repetido recusa: quem digita esta
 * olhando para a ficha e quase sempre e engano. Vindo de uma LISTA, nao:
 * marido e mulher dividem um numero, e recusar a linha perde a pessoa.
 *
 * O que nunca acontece nos dois casos e o que a regra existe para impedir:
 * dois usuarios ATIVOS com o mesmo telefone no mesmo time. O link do time
 * procura a pessoa pelo numero e, achando duas, nao deixa entrar NENHUMA.
 */

interface Row {
  [key: string]: unknown;
}

const db: { users: Row[] } = { users: [] };

vi.mock('@/lib/supabase/rest', () => ({
  selectRows: async (table: string, options: { filters?: Record<string, string> }) => {
    if (table !== 'cmd_users') return [];
    const filtros = options.filters ?? {};
    return db.users.filter(
      (row) =>
        row.client_id === String(filtros.client_id ?? '').slice(3) &&
        row.phone === String(filtros.phone ?? '').slice(3) &&
        row.is_active === true,
    );
  },
  selectOne: async () => null,
  insertOne: async () => ({ id: 'novo' }),
  updateRows: async () => [],
  callFunction: async () => null,
  inFilter: (values: string[]) => `in.(${values.join(',')})`,
}));

vi.mock('@/lib/supabase/storage', () => ({ signedUrl: async () => null, signedUrls: async () => [] }));

const { assertTeamPhoneAvailable, teamPhoneTaken } = await import('@/lib/server/user.service');

beforeEach(() => {
  db.users = [
    {
      id: 'u-1',
      client_id: 'cli-1',
      member_id: 'mem-1',
      phone: '82999990001',
      is_active: true,
    },
  ];
});

describe('telefone já usado no time', () => {
  it('é reconhecido sem derrubar o cadastro', async () => {
    expect(await teamPhoneTaken('cli-1', '82999990001')).toBe(true);
    expect(await teamPhoneTaken('cli-1', '(82) 99999-0001')).toBe(true);
  });

  it('número livre, número de outro time e número incompleto não são conflito', async () => {
    expect(await teamPhoneTaken('cli-1', '82999990002')).toBe(false);
    expect(await teamPhoneTaken('cli-2', '82999990001')).toBe(false);
    // Incompleto nunca vira acesso: não há credencial a duplicar.
    expect(await teamPhoneTaken('cli-1', '8299999')).toBe(false);
    expect(await teamPhoneTaken('cli-1', '')).toBe(false);
  });

  it('usuário desativado não segura o número', async () => {
    db.users = db.users.map((row) => ({ ...row, is_active: false }));
    expect(await teamPhoneTaken('cli-1', '82999990001')).toBe(false);
  });

  it('cadastrando uma pessoa por vez, o número repetido continua recusando', async () => {
    await expect(assertTeamPhoneAvailable('cli-1', '82999990001')).rejects.toThrow();
  });

  it('a mesma pessoa não conflita consigo mesma', async () => {
    await expect(
      assertTeamPhoneAvailable('cli-1', '82999990001', { memberId: 'mem-1' }),
    ).resolves.toBeUndefined();
  });
});
