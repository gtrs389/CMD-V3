import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * As pessoas ficticias do Time DEMO nao recebem acesso.
 *
 * Elas sao DADOS de demonstracao, e nada mais: existem em `cmd_members` e em
 * nenhum outro lugar. Sem usuario, sem senha, sem sessao, sem link de acesso,
 * sem aparelho vinculado e sem convite pessoal — nao ha por onde entrar nem
 * o que gerar em nome delas.
 *
 * Quem tem acesso ao painel e somente quem o ADMIN geral cadastrou a mao, na
 * criacao do time. O teste olha exatamente isso: o que o servico ESCREVE.
 */

const TIME = {
  id: 'time-demo',
  name: 'Time Demonstração',
  isDemo: true,
  form: {
    fields: [
      {
        id: 'fld-1',
        systemKey: 'relationship',
        options: [
          { id: 'opt_a', label: 'Apoiador' },
          { id: 'opt_b', label: 'Liderança' },
        ],
      },
    ],
  },
};

const escritas: { tabela: string; linhas: Record<string, unknown>[] }[] = [];

vi.mock('@/lib/server/client.service', () => ({
  createClient: async () => TIME,
  getClient: async () => TIME,
  deleteClient: async () => undefined,
}));

vi.mock('@/lib/supabase/rest', () => ({
  callFunction: async (nome: string) => {
    if (nome === 'cmd_demo_claim') {
      return [{ seed_id: 'seed-1', client_id: null, claimed: true }];
    }
    return null;
  },
  selectRows: async (table: string) => {
    // Administradores criados junto com o time: sao eles, e somente eles,
    // que existem em cmd_users.
    if (table === 'cmd_users') {
      return [{ id: 'user-admin-1', name: 'Administradora do Time', phone: '11999990000' }];
    }
    return [];
  },
  insertRows: async (table: string, linhas: Record<string, unknown>[], select?: string) => {
    escritas.push({ tabela: table, linhas });

    if (table === 'cmd_map_locations') {
      return linhas.map((linha, index) => ({
        id: `loc-${index}`,
        query_hash: linha.query_hash,
      }));
    }
    if (table === 'cmd_members') {
      return linhas.map((linha, index) => ({
        id: `mem-${index}`,
        name: linha.name,
        phone: linha.phone,
      }));
    }
    return linhas.map((_, index) => ({ id: `${select ?? 'row'}-${index}` }));
  },
  updateRows: async () => [],
  deleteRows: async () => [],
  selectOne: async () => null,
  inFilter: (values: readonly string[]) => `in.(${values.join(',')})`,
  notInFilter: (values: readonly string[]) => `not.in.(${values.join(',')})`,
}));

const { createDemoTeam } = await import('@/lib/server/demo.service');

async function criar(admins = 1, people = 12) {
  return createDemoTeam(
    {
      name: 'Time Demonstração',
      admins: Array.from({ length: admins }, (_, index) => ({
        name: `Administrador ${index + 1}`,
        phone: `1199999000${index}`,
      })),
      people,
      places: 3,
      seedKey: 'demo_chave_de_teste',
    },
    { id: 'user-admin-geral' },
  );
}

beforeEach(() => {
  escritas.length = 0;
});

describe('pessoas fictícias do Time DEMO', () => {
  it('não criam usuário, sessão, convite nem aparelho', async () => {
    await criar();

    const tabelas = escritas.map((item) => item.tabela);

    // Só três destinos: integrantes, coordenadas e vínculos do mapa.
    expect(new Set(tabelas)).toEqual(
      new Set(['cmd_members', 'cmd_map_locations', 'cmd_member_locations']),
    );

    // Nada de acesso, em nenhuma forma.
    for (const proibida of [
      'cmd_users',
      'cmd_sessions',
      'cmd_invites',
      'cmd_member_devices',
      'cmd_admin_devices',
      'cmd_team_access_links',
    ]) {
      expect(tabelas).not.toContain(proibida);
    }
  });

  it('gravam os integrantes com os dados que as telas leem', async () => {
    await criar(1, 12);

    const membros = escritas.find((item) => item.tabela === 'cmd_members');
    expect(membros?.linhas).toHaveLength(12);

    for (const linha of membros?.linhas ?? []) {
      expect(linha.client_id).toBe(TIME.id);
      expect(linha.name).toBeTruthy();
      expect(linha.phone).toBeTruthy();
      // Responsável pelo cadastro: um administrador de verdade do time.
      expect(linha.recruited_by_user_id).toBe('user-admin-1');
      expect(linha.recruited_by_role).toBe('CANDIDATE');
      // Sem documento, como em todo o conjunto de demonstração.
      expect(linha.cpf).toBeUndefined();
      expect(linha.voter_id).toBeUndefined();
    }

    // Duas linhas de mapa por pessoa: moradia e local de votação.
    const vinculos = escritas.find((item) => item.tabela === 'cmd_member_locations');
    expect(vinculos?.linhas).toHaveLength(24);

    // Todas com as MESMAS chaves. O PostgREST recusa o lote inteiro quando
    // uma linha tem uma coluna a mais que a outra (PGRST102) — foi assim que
    // a criação quebrou: só a moradia levava `location_precision`.
    const chaves = (vinculos?.linhas ?? []).map((linha) =>
      Object.keys(linha).sort().join(','),
    );
    expect(new Set(chaves).size).toBe(1);
    expect(chaves[0]).toContain('location_precision');
  });

  it('aceitam quantos administradores forem necessários', async () => {
    // Não existe teto: o time se divide entre todos eles.
    await criar(14, 28);

    const membros = escritas.find((item) => item.tabela === 'cmd_members');
    expect(membros?.linhas).toHaveLength(28);
  });
});
