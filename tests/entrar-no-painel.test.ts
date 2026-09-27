import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "Entrar no painel" a partir da ficha (`prepararPainelDoIntegrante`).
 *
 * O botao sumia de quem nao tinha acesso ativo — Lideres sem acesso ficavam
 * sem botao e sem explicacao. Agora cada caso tem destino: entra, libera o
 * acesso e entra, religa e entra, ou recusa DIZENDO o motivo.
 */

type Usuario = { id: string; member_id: string; client_id: string; phone: string | null; is_active: boolean };

const TIME = 'time-1';
const DEMO = 'time-demo';
let usuarios: Usuario[] = [];
const inseridos: Record<string, unknown>[] = [];
const atualizados: Record<string, unknown>[] = [];

vi.mock('@/lib/supabase/rest', () => ({
  selectRows: async (table: string, options: { filters?: Record<string, string> }) => {
    const f = options.filters ?? {};
    if (table === 'cmd_clients') {
      const id = String(f.id ?? '').replace('eq.', '');
      return f.is_demo === 'is.true' && id === DEMO ? [{ id }] : [];
    }
    if (table === 'cmd_users' && f.phone) {
      return usuarios.filter(
        (u) =>
          `eq.${u.client_id}` === f.client_id && `eq.${u.phone}` === f.phone && (f.is_active !== 'is.true' || u.is_active),
      );
    }
    return [];
  },
  selectOne: async (table: string, options: { filters?: Record<string, string> }) => {
    const f = options.filters ?? {};
    if (table === 'cmd_users' && f.member_id) {
      return usuarios.find((u) => `eq.${u.member_id}` === f.member_id) ?? null;
    }
    return null;
  },
  insertOne: async (_table: string, valor: Record<string, unknown>) => {
    inseridos.push(valor);
    return { id: 'user-novo' };
  },
  insertRows: async () => [],
  updateRows: async (_table: string, _f: unknown, valor: Record<string, unknown>) => {
    atualizados.push(valor);
    return [];
  },
  deleteRows: async () => [],
  callFunction: async () => null,
  inFilter: (values: readonly string[]) => `in.(${values.join(',')})`,
  notInFilter: (values: readonly string[]) => `not.in.(${values.join(',')})`,
}));

vi.mock('@/lib/server/invite.service', () => ({
  ensurePersonalInvite: async () => ({ id: 'invite-1' }),
}));

const { prepararPainelDoIntegrante } = await import('@/lib/server/user.service');

const lider = (x: Partial<{ id: string; clientId: string; phone: string | null }> = {}) => ({
  id: 'mem-lider',
  clientId: TIME,
  name: 'João Silva',
  phone: '82999871807',
  ...x,
});

beforeEach(() => {
  usuarios = [];
  inseridos.length = 0;
  atualizados.length = 0;
});

describe('entrar no painel pela ficha', () => {
  it('acesso ativo: entra direto, sem mexer em nada', async () => {
    usuarios = [{ id: 'u-1', member_id: 'mem-lider', client_id: TIME, phone: '82999871807', is_active: true }];
    await expect(prepararPainelDoIntegrante(lider())).resolves.toBe('u-1');
    expect(inseridos).toHaveLength(0);
    expect(atualizados).toHaveLength(0);
  });

  it('usuário ativo sem telefone também entra: quem entra é o ADMIN', async () => {
    usuarios = [{ id: 'u-1', member_id: 'mem-lider', client_id: TIME, phone: null, is_active: true }];
    await expect(prepararPainelDoIntegrante(lider({ phone: '' }))).resolves.toBe('u-1');
  });

  it('sem acesso ainda, com celular válido e só dele: o acesso nasce agora', async () => {
    await expect(prepararPainelDoIntegrante(lider())).resolves.toBe('user-novo');
    expect(inseridos[0]).toMatchObject({ phone: '82999871807', member_id: 'mem-lider', is_active: true });
  });

  it('acesso desligado: religa com o telefone do cadastro', async () => {
    usuarios = [{ id: 'u-1', member_id: 'mem-lider', client_id: TIME, phone: '82999871807', is_active: false }];
    await expect(prepararPainelDoIntegrante(lider())).resolves.toBe('u-1');
    expect(atualizados[0]).toMatchObject({ is_active: true, phone: '82999871807' });
  });

  it('celular incompleto: recusa dizendo o que corrigir', async () => {
    await expect(prepararPainelDoIntegrante(lider({ phone: '8299987' }))).rejects.toThrow(/celular completo/);
    expect(inseridos).toHaveLength(0);
  });

  it('telefone que já é o acesso de outra pessoa do time: recusa, sem criar nada', async () => {
    usuarios = [{ id: 'u-outro', member_id: 'mem-outro', client_id: TIME, phone: '82999871807', is_active: true }];
    await expect(prepararPainelDoIntegrante(lider())).rejects.toThrow(/outra pessoa do time/);
    expect(inseridos).toHaveLength(0);
  });

  it('não religa quem teria o telefone de outra pessoa ativa', async () => {
    usuarios = [
      { id: 'u-1', member_id: 'mem-lider', client_id: TIME, phone: '82999871807', is_active: false },
      { id: 'u-outro', member_id: 'mem-outro', client_id: TIME, phone: '82999871807', is_active: true },
    ];
    await expect(prepararPainelDoIntegrante(lider())).rejects.toThrow(/outra pessoa do time/);
    expect(atualizados).toHaveLength(0);
  });

  it('Time DEMO: pessoa fictícia não ganha painel', async () => {
    await expect(prepararPainelDoIntegrante(lider({ clientId: DEMO }))).rejects.toThrow(/demonstração/);
    expect(inseridos).toHaveLength(0);
  });
});
