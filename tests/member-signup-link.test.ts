import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Link de cadastro na ficha do integrante.
 *
 * O endereco so pode aparecer enquanto o convite ainda esta na MESMA geracao
 * do cadastro. Depois de renovado, o token do convite e outro: mostra-lo
 * apontaria o ADMIN para um link que a pessoa nunca abriu.
 */

const estado: {
  consumed: Record<string, unknown> | null;
  invite: Record<string, unknown> | null;
  generated: Record<string, unknown> | null;
} = { consumed: null, invite: null, generated: null };

vi.mock('@/lib/supabase/rest', () => ({
  selectOne: vi.fn(async (table: string, options: { filters: Record<string, string> }) => {
    if (table === 'cmd_invites') return estado.invite;
    return options.filters.event === 'eq.CONSUMED' ? estado.consumed : estado.generated;
  }),
}));

const { getMemberSignupLink } = await import('@/lib/server/member-link.service');

beforeEach(() => {
  estado.consumed = {
    invite_ref: 'inv-1',
    generation: 2,
    owner_name: 'Maria',
    occurred_at: '2026-09-10T12:00:00.000Z',
  };
  estado.generated = { occurred_at: '2026-09-09T12:00:00.000Z', generated_by_name: 'ADMIN' };
  estado.invite = {
    id: 'inv-1',
    token: 'tok-da-geracao-2',
    generation: 2,
    owner_name: 'Maria',
    generated_by_name: 'ADMIN',
    issued_at: '2026-09-09T12:00:00.000Z',
    consumed_at: '2026-09-10T12:00:00.000Z',
  };
});

describe('link de cadastro do integrante', () => {
  it('devolve o token quando o convite ainda e da geracao do cadastro', async () => {
    const link = await getMemberSignupLink('mem-1');
    expect(link).toMatchObject({
      token: 'tok-da-geracao-2',
      ownerName: 'Maria',
      generatedByName: 'ADMIN',
      consumedAt: '2026-09-10T12:00:00.000Z',
    });
  });

  it('nao devolve o token de um link renovado depois do cadastro', async () => {
    // Renovar zera o vinculo com o integrante: o convite nem volta na busca.
    estado.invite = null;
    const link = await getMemberSignupLink('mem-1');
    expect(link?.token).toBeNull();
    expect(link?.ownerName).toBe('Maria');
    expect(link?.generatedAt).toBe('2026-09-09T12:00:00.000Z');
  });

  it('nao confunde geracoes do mesmo convite', async () => {
    estado.invite = { ...estado.invite!, generation: 3, token: 'tok-da-geracao-3' };
    const link = await getMemberSignupLink('mem-1');
    expect(link?.token).toBeNull();
  });

  it('devolve nulo quando nao ha link nenhum', async () => {
    estado.consumed = null;
    estado.invite = null;
    expect(await getMemberSignupLink('mem-1')).toBeNull();
  });
});
