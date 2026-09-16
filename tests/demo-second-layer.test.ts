import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Segunda camada do Time DEMO, com um banco em memoria.
 *
 * Um time real tem duas camadas: o administrador cadastra gente, e parte
 * dessa gente cadastra mais gente. O Time DEMO so tinha a primeira — as mil
 * pessoas apareciam todas como cadastradas pelo administrador, e o "Ranking
 * de cadastros equipe" ficava com a lista inteira em zero.
 *
 * O que estes testes protegem, alem do ranking: que NINGUEM ganhe entrada no
 * painel. As pessoas de um Time DEMO sao dados e os telefones delas sao
 * ficticios; o login por link + telefone so aceita usuario ativo, entao o
 * usuario de um recrutador tem de nascer DESLIGADO.
 */

interface Row {
  [key: string]: unknown;
}

const db: Record<string, Row[]> = {
  cmd_clients: [],
  cmd_users: [],
  cmd_members: [],
  cmd_invites: [],
};

let sequence = 0;
const nextId = (prefixo: string) => `${prefixo}-${(sequence += 1)}`;

function matches(row: Row, filters: Record<string, string> = {}): boolean {
  return Object.entries(filters).every(([coluna, expressao]) => {
    const valor = row[coluna];
    if (expressao === 'not.is.null') return valor !== null && valor !== undefined;
    if (expressao === 'is.null') return valor === null || valor === undefined;
    if (expressao === 'is.true') return valor === true;
    if (expressao === 'is.false') return valor === false;
    if (expressao.startsWith('eq.')) return String(valor) === expressao.slice(3);
    if (expressao.startsWith('in.(')) {
      return expressao
        .slice(4, -1)
        .split(',')
        .map((item) => item.replace(/^"|"$/g, ''))
        .includes(String(valor));
    }
    return true;
  });
}

/**
 * O gatilho `cmd_members_recruiter_guard`, como ele existe no Postgres.
 *
 * Sem isto o banco em memoria aceitava qualquer reescrita da origem do
 * cadastro, e os testes passavam enquanto a producao recusava com
 * 'origem do cadastro nao pode ser alterada' (P0001) — que foi exatamente o
 * que aconteceu. Um banco de teste sem os gatilhos do banco de verdade
 * aprova codigo que o banco de verdade reprova.
 *
 * Tres saidas aceitas, iguais as das migrations 012, 032 e 039:
 *   1. o responsavel foi excluido (identificador nulo, snapshots intactos);
 *   2. a troca veio REGISTRADA — quando, quem, e de quem era;
 *   3. a linha e GERADA de demonstracao (`demo_seed`), cuja origem e
 *      fabricada desde o INSERT.
 */
function guardaDoResponsavel(old: Row, next: Row): void {
  const mudou = (['recruited_by_user_id', 'recruited_by_name', 'recruited_by_role'] as const).some(
    (coluna) => coluna in next && next[coluna] !== old[coluna],
  );
  if (!mudou) return;

  const desligou =
    next.recruited_by_user_id === null &&
    (!('recruited_by_name' in next) || next.recruited_by_name === old.recruited_by_name);

  const registrou =
    Boolean(next.recruited_by_user_id) &&
    Boolean(next.recruiter_changed_at) &&
    next.recruiter_changed_at !== old.recruiter_changed_at &&
    Boolean(next.recruiter_changed_by) &&
    next.recruiter_previous_name === old.recruited_by_name;

  // A marca so e escrita pela geracao: cadastro real, e cadastro feito a mao
  // dentro de um Time DEMO, nao a tem.
  const gerado = old.demo_seed !== null && old.demo_seed !== undefined;

  if (!desligou && !registrou && !gerado) {
    throw new Error('origem do cadastro nao pode ser alterada');
  }
}

vi.mock('@/lib/supabase/rest', () => ({
  inFilter: (values: readonly string[]) => `in.(${values.map((v) => `"${v}"`).join(',')})`,
  notInFilter: (values: readonly string[]) => `not.in.(${values.map((v) => `"${v}"`).join(',')})`,
  selectRows: async (table: string, options: { filters?: Record<string, string> } = {}) =>
    db[table].filter((row) => matches(row, options.filters)).map((row) => ({ ...row })),
  selectOne: async (table: string, options: { filters?: Record<string, string> } = {}) => {
    const row = db[table].find((item) => matches(item, options.filters));
    return row ? { ...row } : null;
  },
  insertOne: async (table: string, value: Row) => {
    const criado = { id: nextId(table), ...value };
    db[table].push(criado);
    return { ...criado };
  },
  insertRows: async (table: string, values: Row[]) => {
    const criados = values.map((v) => ({ id: nextId(table), ...v }));
    db[table].push(...criados);
    return criados.map((r) => ({ ...r }));
  },
  insertRowsInChunks: async (table: string, values: Row[]) => {
    const criados = values.map((v) => ({ id: nextId(table), ...v }));
    db[table].push(...criados);
    return criados.map((r) => ({ ...r }));
  },
  updateRows: async (table: string, filters: Record<string, string>, values: Row) => {
    const alterados: Row[] = [];
    for (const row of db[table]) {
      if (!matches(row, filters)) continue;
      if (table === 'cmd_members') guardaDoResponsavel(row, values);
      Object.assign(row, values);
      alterados.push({ ...row });
    }
    return alterados;
  },
  deleteRows: async (table: string, filters: Record<string, string>) => {
    const removidos = db[table].filter((row) => matches(row, filters));
    db[table] = db[table].filter((row) => !matches(row, filters));
    return removidos;
  },
  callFunction: async () => null,
  SupabaseRequestError: class extends Error {
    isMissingSchema = false;
  },
}));

const TIME = 'demo-1';
const ADMIN_USER = 'user-admin';
const TOTAL_PESSOAS = 100;

vi.mock('@/lib/server/client.service', () => ({
  getClient: async (id: string) => {
    const row = db.cmd_clients.find((c) => c.id === id);
    return row ? { id: row.id, name: row.name, isDemo: row.is_demo === true } : null;
  },
  createClient: async () => ({ id: TIME }),
  deleteClient: async () => undefined,
}));
vi.mock('@/lib/supabase/storage', () => ({ deleteImage: async () => undefined }));
vi.mock('@/lib/server/demo-locations', () => ({
  pollingPlaceLookup: () => null,
  residenceLookupFor: () => null,
  resolveDemoPoint: async () => null,
}));

beforeEach(() => {
  for (const tabela of Object.keys(db)) db[tabela] = [];
  sequence = 0;

  db.cmd_clients.push({ id: TIME, name: 'Time DEMO', is_demo: true });
  db.cmd_users.push({
    id: ADMIN_USER,
    name: 'Marcos',
    phone: '82999990000',
    role: 'CANDIDATE',
    client_id: TIME,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
  });

  for (let i = 0; i < TOTAL_PESSOAS; i += 1) {
    db.cmd_members.push({
      id: `m-${i}`,
      client_id: TIME,
      name: `Pessoa ${i}`,
      phone: `8298888${String(i).padStart(4, '0')}`,
      demo_seed: 'v1',
      created_at: `2026-02-${String((i % 27) + 1).padStart(2, '0')}T00:00:00.000Z`,
      recruited_by_user_id: ADMIN_USER,
      recruited_by_name: 'Marcos',
      recruited_by_role: 'CANDIDATE',
    });
  }
});

/** O mesmo calculo do quadro "Ranking de cadastros equipe". */
function ranking(): { nome: string; cadastros: number }[] {
  const porResponsavel = new Map<string, number>();
  for (const m of db.cmd_members) {
    const id = m.recruited_by_user_id as string | null;
    if (id) porResponsavel.set(id, (porResponsavel.get(id) ?? 0) + 1);
  }

  return db.cmd_users
    .filter((u) => u.role === 'EQUIPE')
    .map((u) => ({ nome: u.name as string, cadastros: porResponsavel.get(u.id as string) ?? 0 }))
    .sort((a, b) => b.cadastros - a.cadastros);
}

describe('segunda camada do Time DEMO', () => {
  it('sem ela, o ranking da equipe fica vazio', () => {
    // O estado de antes: todos cadastrados pelo administrador.
    expect(ranking()).toEqual([]);
    expect(db.cmd_members.every((m) => m.recruited_by_role === 'CANDIDATE')).toBe(true);
  });

  it('enche o ranking, com numeros DIFERENTES entre si', async () => {
    const { setDemoRecruiters } = await import('@/lib/server/demo.service');
    const resultado = await setDemoRecruiters(TIME, 5);

    expect(resultado.recruiters).toBe(5);
    expect(resultado.moved).toBeGreaterThan(0);

    const linhas = ranking();
    expect(linhas).toHaveLength(5);
    // Um ranking empatado nao demonstra nada.
    expect(new Set(linhas.map((l) => l.cadastros)).size).toBeGreaterThan(1);
    expect(linhas[0].cadastros).toBeGreaterThan(0);
  });

  it('o administrador continua com cadastros proprios', async () => {
    const { setDemoRecruiters } = await import('@/lib/server/demo.service');
    await setDemoRecruiters(TIME, 5);

    const doAdmin = db.cmd_members.filter((m) => m.recruited_by_user_id === ADMIN_USER).length;
    expect(doAdmin).toBeGreaterThan(0);
  });

  it('NINGUEM ganha entrada no painel: o acesso nasce desligado', async () => {
    const { setDemoRecruiters } = await import('@/lib/server/demo.service');
    await setDemoRecruiters(TIME, 5);

    const equipe = db.cmd_users.filter((u) => u.role === 'EQUIPE');
    expect(equipe).toHaveLength(5);
    // O login por link + telefone filtra `is_active: is.true`. Desligado,
    // nenhum telefone ficticio abre o painel do time.
    expect(equipe.every((u) => u.is_active === false)).toBe(true);
    expect(equipe.every((u) => u.password_hash === null)).toBe(true);
  });

  it('um numero MENOR desfaz e devolve os cadastros ao administrador', async () => {
    const { setDemoRecruiters } = await import('@/lib/server/demo.service');
    await setDemoRecruiters(TIME, 5);
    await setDemoRecruiters(TIME, 2);

    expect(db.cmd_users.filter((u) => u.role === 'EQUIPE')).toHaveLength(2);
    // Ninguem pode ficar apontando para um recrutador que nao existe mais.
    const vivos = new Set(db.cmd_users.map((u) => u.id));
    expect(db.cmd_members.every((m) => vivos.has(m.recruited_by_user_id as string))).toBe(true);
  });

  it('zero devolve o time a UMA camada, sem apagar ninguem', async () => {
    const { setDemoRecruiters } = await import('@/lib/server/demo.service');
    await setDemoRecruiters(TIME, 5);
    await setDemoRecruiters(TIME, 0);

    expect(db.cmd_users.filter((u) => u.role === 'EQUIPE')).toHaveLength(0);
    // As PESSOAS continuam: elas so deixaram de recrutar.
    expect(db.cmd_members).toHaveLength(TOTAL_PESSOAS);
    expect(db.cmd_members.every((m) => m.recruited_by_user_id === ADMIN_USER)).toBe(true);
  });

  it('refazer com o mesmo numero nao duplica recrutador', async () => {
    const { setDemoRecruiters } = await import('@/lib/server/demo.service');
    await setDemoRecruiters(TIME, 3);
    await setDemoRecruiters(TIME, 3);

    expect(db.cmd_users.filter((u) => u.role === 'EQUIPE')).toHaveLength(3);
  });
});

describe('a guarda do banco continua de pe', () => {
  it('recusa reescrever a origem de um cadastro NAO gerado', () => {
    // Uma pessoa cadastrada a mao durante a demonstracao: sem `demo_seed`,
    // ela tem origem de verdade e continua protegida.
    const aMao: Row = {
      id: 'm-mao',
      client_id: TIME,
      name: 'Cadastrada a mao',
      demo_seed: null,
      recruited_by_user_id: ADMIN_USER,
      recruited_by_name: 'Marcos',
      recruited_by_role: 'CANDIDATE',
    };

    expect(() =>
      guardaDoResponsavel(aMao, {
        recruited_by_user_id: 'outro',
        recruited_by_name: 'Jose',
        recruited_by_role: 'EQUIPE',
      }),
    ).toThrow('origem do cadastro nao pode ser alterada');
  });

  it('aceita a troca REGISTRADA, com o nome de quem esta saindo', () => {
    const real: Row = {
      id: 'm-real',
      demo_seed: null,
      recruited_by_user_id: ADMIN_USER,
      recruited_by_name: 'Marcos',
      recruited_by_role: 'CANDIDATE',
      recruiter_changed_at: null,
    };

    expect(() =>
      guardaDoResponsavel(real, {
        recruited_by_user_id: 'outro',
        recruited_by_name: 'Jose',
        recruited_by_role: 'EQUIPE',
        recruiter_changed_at: '2026-09-16T00:00:00.000Z',
        recruiter_changed_by: ADMIN_USER,
        recruiter_previous_name: 'Marcos',
      }),
    ).not.toThrow();
  });
});
