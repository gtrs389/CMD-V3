import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Troca de responsavel por um cadastro.
 *
 * O banco so aceita a troca quando ela chega REGISTRADA e com o registro
 * verdadeiro (migration 032): instante novo, quem trocou, e o nome anterior
 * sendo exatamente o que esta saindo. Se o servico parar de mandar qualquer
 * uma dessas colunas, a guarda recusa — e a falha so apareceria em
 * producao, no clique de alguem.
 *
 * Este teste prende o contrato do lado de ca: e o que chega no `update` que
 * importa.
 */

const MARIA = { id: 'user-maria', name: 'Maria', role: 'EQUIPE', client_id: 'time-1', is_active: true };
const JOAO = { id: 'user-joao', name: 'João Silva', role: 'CANDIDATE', client_id: 'time-1', is_active: true };

/** Cadastro que hoje esta com a Maria. */
const CADASTRO = {
  id: 'mem-1',
  client_id: 'time-1',
  name: 'Pessoa Cadastrada',
  phone: '11999999999',
  recruited_by_user_id: MARIA.id,
  recruited_by_name: MARIA.name,
  recruited_by_role: MARIA.role,
  recruiter_changed_at: null,
  recruiter_changed_by: null,
  recruiter_previous_name: null,
  responses: [],
  source: 'invite',
  created_at: '2026-09-01T10:00:00.000Z',
  updated_at: '2026-09-01T10:00:00.000Z',
};

const patches: Record<string, unknown>[] = [];
const estado = {
  destino: JOAO as Record<string, unknown>,
  /** Quem cadastrou o destino, quando ele e do perfil EQUIPE. */
  origemDoDestino: 'CANDIDATE' as string | null,
  /** Usuario da pessoa que esta sendo passada, se ela tiver acesso. */
  usuarioDoCadastro: null as Record<string, unknown> | null,
  /** Quem essa pessoa ja cadastrou. */
  equipeDoCadastro: [] as Record<string, unknown>[],
};

vi.mock('@/lib/supabase/storage', () => ({
  signedUrls: async (paths: unknown[]) => paths.map(() => null),
  signedUrl: async () => null,
  isDataUrl: () => false,
}));

vi.mock('@/lib/supabase/rest', () => ({
  selectOne: async (table: string, options: { select?: string; filters?: Record<string, string> }) => {
    if (table === 'cmd_members') {
      // A leitura do nivel do destino pede so a origem do cadastro dele.
      if (options.select === 'recruited_by_role') {
        return { recruited_by_role: estado.origemDoDestino };
      }
      return { ...CADASTRO };
    }
    if (table === 'cmd_users') {
      if (options.filters?.member_id) return estado.usuarioDoCadastro;
      const id = (options.filters?.id ?? '').replace('eq.', '');
      return id === estado.destino.id ? { ...estado.destino } : null;
    }
    return null;
  },
  selectRows: async (table: string, options: { filters?: Record<string, string> }) => {
    if (table === 'cmd_members' && options.filters?.recruited_by_user_id) {
      return estado.equipeDoCadastro;
    }
    return [];
  },
  updateRows: async (_table: string, _filters: unknown, patch: Record<string, unknown>) => {
    patches.push(patch);
    return [{ ...CADASTRO, ...patch }];
  },
  insertRows: async () => [],
  insertOne: async () => ({ ...CADASTRO }),
  deleteRows: async () => [],
  callFunction: async () => null,
  inFilter: (values: readonly string[]) => `in.(${values.join(',')})`,
}));

const { transferMember } = await import('@/lib/server/member.service');

beforeEach(() => {
  patches.length = 0;
  estado.destino = JOAO;
  estado.origemDoDestino = 'CANDIDATE';
  estado.usuarioDoCadastro = null;
  estado.equipeDoCadastro = [];
});

describe('passar o cadastro para outro responsável', () => {
  it('grava o novo responsável junto do registro verdadeiro da troca', async () => {
    await transferMember(CADASTRO.id, JOAO.id, 'user-admin');

    const patch = patches.at(-1);
    expect(patch).toBeDefined();

    // Novo responsável, nos três campos que o banco confere.
    expect(patch).toMatchObject({
      recruited_by_user_id: JOAO.id,
      recruited_by_name: JOAO.name,
      recruited_by_role: JOAO.role,
      recruiter_changed_by: 'user-admin',
    });

    // O nome anterior precisa ser EXATAMENTE quem está saindo: é essa
    // condição que impede reescrever a origem sem contar de quem ela era.
    expect(patch?.recruiter_previous_name).toBe(MARIA.name);

    // Instante novo, e do servidor.
    const quando = String(patch?.recruiter_changed_at);
    expect(Number.isNaN(Date.parse(quando))).toBe(false);
    expect(quando).not.toBe(CADASTRO.recruiter_changed_at);
  });

  it('recusa destino de outro time antes de tocar no banco', async () => {
    estado.destino = { ...JOAO, client_id: 'outro-time' };

    await expect(transferMember(CADASTRO.id, JOAO.id, 'user-admin')).rejects.toMatchObject({
      status: 400,
    });
    expect(patches).toHaveLength(0);
  });

  it('recusa destino desativado e perfil que não recebe cadastro', async () => {
    estado.destino = { ...JOAO, is_active: false };
    await expect(transferMember(CADASTRO.id, JOAO.id, 'user-admin')).rejects.toMatchObject({
      status: 404,
    });

    estado.destino = { ...JOAO, role: 'ADMIN' };
    await expect(transferMember(CADASTRO.id, JOAO.id, 'user-admin')).rejects.toMatchObject({
      status: 400,
    });

    expect(patches).toHaveLength(0);
  });

  it('recusa passar para quem já é o responsável', async () => {
    estado.destino = MARIA;

    await expect(transferMember(CADASTRO.id, MARIA.id, 'user-admin')).rejects.toMatchObject({
      status: 400,
    });
    expect(patches).toHaveLength(0);
  });
});

describe('Líder e Equipe na troca de responsável', () => {
  /** Lider: do perfil EQUIPE, cadastrado pela administracao do time. */
  const BRUNA = {
    id: 'user-bruna',
    name: 'Bruna Costa',
    role: 'EQUIPE',
    client_id: 'time-1',
    is_active: true,
    member_id: 'mem-bruna',
  };

  it('passa o cadastro para um Líder', async () => {
    estado.destino = BRUNA;
    estado.origemDoDestino = 'CANDIDATE';

    await transferMember(CADASTRO.id, BRUNA.id, 'user-admin');
    expect(patches.at(-1)).toMatchObject({ recruited_by_user_id: BRUNA.id });
  });

  it('recusa passar para quem é da Equipe: a Equipe não cadastra', async () => {
    estado.destino = BRUNA;
    // Bruna foi cadastrada por um Lider: e Equipe.
    estado.origemDoDestino = 'EQUIPE';

    await expect(transferMember(CADASTRO.id, BRUNA.id, 'user-admin')).rejects.toMatchObject({
      status: 400,
    });
    expect(patches).toHaveLength(0);
  });

  it('recusa pôr um Líder que já tem Equipe abaixo de outro Líder', async () => {
    estado.destino = BRUNA;
    estado.usuarioDoCadastro = { id: 'user-do-cadastro' };
    estado.equipeDoCadastro = [{ id: 'mem-da-equipe' }];

    await expect(transferMember(CADASTRO.id, BRUNA.id, 'user-admin')).rejects.toMatchObject({
      status: 400,
    });
    expect(patches).toHaveLength(0);
  });

  it('Líder com Equipe pode passar para a administração do time', async () => {
    estado.destino = JOAO;
    estado.usuarioDoCadastro = { id: 'user-do-cadastro' };
    estado.equipeDoCadastro = [{ id: 'mem-da-equipe' }];

    await transferMember(CADASTRO.id, JOAO.id, 'user-admin');
    expect(patches.at(-1)).toMatchObject({ recruited_by_user_id: JOAO.id });
  });
});
