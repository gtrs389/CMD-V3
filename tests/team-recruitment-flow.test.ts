import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Fluxo de recrutamento no servidor, com um banco em memoria.
 *
 * Cobre o que a camada de permissoes nao alcanca: atribuicao do responsavel
 * pelo token, e-mail duplicado sem deixar registro orfao, criacao do acesso
 * EQUIPE com senha so em hash e permanencia do link pessoal.
 *
 * Nenhuma chamada real ao Supabase, a FonteData, a SerpAPI ou ao Brasil
 * Aberto acontece aqui.
 */

interface Row {
  [key: string]: unknown;
}

const db: Record<string, Row[]> = {
  cmd_users: [],
  cmd_clients: [],
  cmd_members: [],
  cmd_invites: [],
  cmd_form_fields: [],
  cmd_member_responses: [],
  cmd_member_locations: [],
};

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

/** Aplica os filtros do PostgREST que os servicos realmente usam. */
function matches(row: Row, filters: Record<string, string> = {}): boolean {
  return Object.entries(filters).every(([column, expression]) => {
    const value = row[column];
    if (expression === 'is.null') return value === null || value === undefined;
    if (expression.startsWith('eq.')) return String(value) === expression.slice(3);
    if (expression.startsWith('in.')) {
      const list = expression
        .slice(4, -1)
        .split(',')
        .map((item) => item.replace(/^"|"$/g, ''));
      return list.includes(String(value));
    }
    return true;
  });
}

vi.mock('@/lib/supabase/rest', () => ({
  inFilter: (values: readonly string[]) => `in.(${values.map((v) => `"${v}"`).join(',')})`,
  selectRows: async (table: string, options: { filters?: Record<string, string> } = {}) =>
    db[table].filter((row) => matches(row, options.filters)).map((row) => ({ ...row })),
  selectOne: async (table: string, options: { filters?: Record<string, string> } = {}) => {
    const row = db[table].find((item) => matches(item, options.filters));
    return row ? { ...row } : null;
  },
  insertRows: async (table: string, values: Row[]) => {
    const created = values.map((value) => ({ id: nextId(table), ...value }));
    db[table].push(...created);
    return created.map((row) => ({ ...row }));
  },
  insertOne: async (table: string, value: Row) => {
    const created = { id: nextId(table), ...value };
    db[table].push(created);
    return { ...created };
  },
  updateRows: async (table: string, filters: Record<string, string>, values: Row) => {
    const changed: Row[] = [];
    for (const row of db[table]) {
      if (!matches(row, filters)) continue;
      Object.assign(row, values);
      changed.push({ ...row });
    }
    return changed;
  },
  deleteRows: async (table: string, filters: Record<string, string>) => {
    const removed = db[table].filter((row) => matches(row, filters));
    db[table] = db[table].filter((row) => !matches(row, filters));
    return removed;
  },
  callFunction: async (name: string, args: Record<string, unknown>) => {
    // Reproduz `cmd_create_team_access`: usuario e link na mesma operacao,
    // ou nada. O e-mail repetido derruba os dois.
    if (name === 'cmd_create_team_access') {
      const email = String(args.p_email).trim().toLowerCase();
      if (db.cmd_users.some((row) => row.email === email)) {
        throw new Error('duplicate key value violates unique constraint "cmd_users_email_key"');
      }
      if (db.cmd_users.some((row) => row.member_id === args.p_member_id)) {
        throw new Error('duplicate key value violates unique constraint "cmd_users_member_id_key"');
      }
      const belongs = db.cmd_members.some(
        (row) => row.id === args.p_member_id && row.client_id === args.p_client_id,
      );
      if (!belongs) throw new Error('integrante nao pertence ao candidato');

      const userId = nextId('user');
      db.cmd_users.push({
        id: userId,
        name: args.p_name,
        email,
        role: 'EQUIPE',
        client_id: args.p_client_id,
        member_id: args.p_member_id,
        password_hash: args.p_password_hash ?? null,
        must_change_password: true,
        is_active: true,
        last_login_at: null,
        created_at: new Date().toISOString(),
      });
      db.cmd_invites.push({
        id: nextId('inv'),
        client_id: args.p_client_id,
        user_id: userId,
        token: args.p_token,
        // Mesmo hash usado pelo servidor: o banco guarda so ele.
        token_hash: createHash('sha256').update(String(args.p_token), 'utf8').digest('hex'),
        active: true,
        created_at: new Date().toISOString(),
        rotated_at: null,
        // Prazo obrigatorio (migration 013): o link nasce com 24 horas.
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        status: 'ACTIVE',
        claim_hash: null,
        claimed_at: null,
        consumed_at: null,
        revoked_at: null,
        generation: 1,
      });
      return userId;
    }

    if (name === 'cmd_set_temp_password') {
      const user = db.cmd_users.find((row) => row.id === args.p_user_id);
      if (user) Object.assign(user, { password_hash: args.p_password_hash, must_change_password: true });
      return 0;
    }

    if (name === 'cmd_revoke_user_sessions') return 0;
    return 0;
  },
}));

vi.mock('@/lib/supabase/storage', () => ({
  signedUrl: async () => null,
  signedUrls: async (paths: (string | null)[]) => paths.map(() => null),
  isDataUrl: () => false,
  uploadImage: async () => ({ path: 'x', mime: 'image/png', size: 1 }),
  deleteImage: async () => undefined,
}));

vi.mock('@/lib/server/map-location.service', () => ({
  createPendingLocation: async () => undefined,
  invalidateLocation: async () => undefined,
  resolveLocation: async () => undefined,
}));

const { hashToken } = await import('@/lib/auth/tokens');
const { resolveInvite, inviteAccepts, ensurePersonalInvite, findInviteByUser } = await import(
  '@/lib/server/invite.service'
);
const { createMember, listMembersForUser, rollbackMember, listMembersRecruitedBy } = await import(
  '@/lib/server/member.service'
);
const { assertTeamPhoneAvailable, createMemberAccess } = await import(
  '@/lib/server/user.service'
);

const OPERACAO_A = 'cli-a';
const OPERACAO_B = 'cli-b';

/** Recria o estado inicial: duas candidaturas, cada uma com o seu link. */
function seed() {
  for (const table of Object.keys(db)) db[table] = [];
  sequence = 0;

  db.cmd_clients.push(
    { id: OPERACAO_A, name: 'Marina Alves', email: 'marina@exemplo.test', recruiting_active: true },
    { id: OPERACAO_B, name: 'Candidato B', email: 'candb@exemplo.test', recruiting_active: true },
  );

  db.cmd_users.push(
    {
      id: 'u-marina',
      name: 'Marina Alves',
      email: 'marina@exemplo.test',
      role: 'CANDIDATE',
      client_id: OPERACAO_A,
      member_id: null,
      is_active: true,
      password_hash: 'scrypt$x$y',
      must_change_password: false,
    },
    {
      id: 'u-candb',
      name: 'Candidato B',
      email: 'candb@exemplo.test',
      role: 'CANDIDATE',
      client_id: OPERACAO_B,
      member_id: null,
      is_active: true,
      password_hash: 'scrypt$x$y',
      must_change_password: false,
    },
  );

  db.cmd_invites.push(
    {
      id: 'inv-marina',
      client_id: OPERACAO_A,
      user_id: 'u-marina',
      token: 'token-marina',
      token_hash: hashToken('token-marina'),
      active: true,
      created_at: new Date().toISOString(),
      rotated_at: null,
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      status: 'ACTIVE',
      claim_hash: null,
      claimed_at: null,
      consumed_at: null,
      revoked_at: null,
      generation: 1,
    },
    {
      id: 'inv-candb',
      client_id: OPERACAO_B,
      user_id: 'u-candb',
      token: 'token-candb',
      token_hash: hashToken('token-candb'),
      active: true,
      created_at: new Date().toISOString(),
      rotated_at: null,
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      status: 'ACTIVE',
      claim_hash: null,
      claimed_at: null,
      consumed_at: null,
      revoked_at: null,
      generation: 1,
    },
  );
}

/** Reproduz o que a rota publica faz, na mesma ordem. */
async function cadastrarPeloLink(token: string, entrada: { name: string; phone: string }) {
  const invite = await resolveInvite(token);
  if (!inviteAccepts(invite) || !invite) throw new Error('link inativo');

  // O telefone identifica a pessoa no acesso: conflito no time barra antes
  // de gravar qualquer coisa.
  await assertTeamPhoneAvailable(invite.clientId, entrada.phone);

  const member = await createMember(
    {
      clientId: invite.clientId,
      name: entrada.name,
      phone: entrada.phone,
      photo: null,
      responses: [],
      consentAt: null,
      source: 'invite',
    },
    invite.owner
      ? { userId: invite.owner.userId, name: invite.owner.name, role: invite.owner.role }
      : null,
  );

  try {
    const userId = await createMemberAccess({
      clientId: invite.clientId,
      memberId: member.id,
      name: member.name,
      phone: member.phone,
    });
    return { member, userId };
  } catch (error) {
    await rollbackMember(member.id);
    throw error;
  }
}

beforeEach(seed);

describe('atribuição pelo link', () => {
  it('registra o responsável a partir do link do candidato', async () => {
    const { member } = await cadastrarPeloLink('token-marina', {
      name: 'João Silva',
      phone: '11911110001',
    });

    expect(member.recruitedBy).toEqual({
      userId: 'u-marina',
      name: 'Marina Alves',
      role: 'CANDIDATE',
      photo: null,
    });
    expect(member.clientId).toBe(OPERACAO_A);
  });

  it('registra o responsável a partir do link de um integrante', async () => {
    await cadastrarPeloLink('token-marina', { name: 'João Silva', phone: '11911110001' });
    const joaoInvite = db.cmd_invites.find((row) => row.token !== 'token-marina' && row.client_id === OPERACAO_A);

    const { member } = await cadastrarPeloLink(String(joaoInvite?.token), {
      name: 'Ana Ribeiro',
      phone: '11911110002',
    });

    expect(member.recruitedBy?.name).toBe('João Silva');
    expect(member.recruitedBy?.role).toBe('EQUIPE');
  });

  it('ignora responsável e candidato forjados: tudo vem do token', async () => {
    // O servico so aceita o responsavel resolvido pelo link. Ainda que a
    // rota recebesse outro valor, ele nao teria por onde entrar.
    const invite = await resolveInvite('token-marina');
    expect(invite?.owner?.userId).toBe('u-marina');
    expect(invite?.clientId).toBe(OPERACAO_A);

    // Token da outra candidatura resolve para a outra operacao, nunca a de A.
    const outro = await resolveInvite('token-candb');
    expect(outro?.clientId).toBe(OPERACAO_B);
    expect(outro?.owner?.userId).toBe('u-candb');

    // Token inexistente nao resolve nada.
    expect(await resolveInvite('token-inventado')).toBeNull();
    expect(await resolveInvite('')).toBeNull();
  });

  it('recusa o link quando o dono foi desativado', async () => {
    const user = db.cmd_users.find((row) => row.id === 'u-marina');
    if (user) user.is_active = false;

    expect(inviteAccepts(await resolveInvite('token-marina'))).toBe(false);
  });

  it('desligar o recrutamento derruba todos os links da operação', async () => {
    await cadastrarPeloLink('token-marina', { name: 'João Silva', phone: '11911110001' });
    const joaoToken = String(
      db.cmd_invites.find((row) => row.client_id === OPERACAO_A && row.user_id !== 'u-marina')?.token,
    );

    const cliente = db.cmd_clients.find((row) => row.id === OPERACAO_A);
    if (cliente) cliente.recruiting_active = false;

    expect(inviteAccepts(await resolveInvite('token-marina'))).toBe(false);
    expect(inviteAccepts(await resolveInvite(joaoToken))).toBe(false);
    // A outra candidatura segue aceitando: o interruptor é por operação.
    expect(inviteAccepts(await resolveInvite('token-candb'))).toBe(true);
  });
});

describe('acesso criado com o cadastro', () => {
  it('cria o usuário EQUIPE sem e-mail e sem senha, com o link pessoal', async () => {
    const { member, userId } = await cadastrarPeloLink('token-marina', {
      name: 'João Silva',
      phone: '11911110001',
    });

    const user = db.cmd_users.find((row) => row.member_id === member.id);
    expect(user?.id).toBe(userId);
    expect(user).toMatchObject({
      role: 'EQUIPE',
      client_id: OPERACAO_A,
      must_change_password: false,
      is_active: true,
    });

    // Quem entra por link do time + telefone nao tem e-mail nem senha:
    // nenhuma credencial e criada, nem mesmo temporaria.
    expect(user?.email).toBeNull();
    expect(user?.password_hash).toBeNull();
    expect(user?.phone).toBe('11911110001');

    // Link pessoal criado junto, com o token guardado tambem como hash.
    const invite = db.cmd_invites.find((row) => row.user_id === user?.id);
    expect(invite).toBeDefined();
    expect(invite?.active).toBe(true);
    expect(invite?.token_hash).toBe(
      createHash('sha256').update(String(invite?.token), 'utf8').digest('hex'),
    );
    expect(invite?.token_hash).not.toBe(invite?.token);
  });

  it('telefone já usado no time interrompe antes de gravar: nenhum registro órfão', async () => {
    await cadastrarPeloLink('token-marina', { name: 'João Silva', phone: '11911110001' });

    const antes = { membros: db.cmd_members.length, usuarios: db.cmd_users.length };

    await expect(
      cadastrarPeloLink('token-marina', { name: 'Outro João', phone: '11911110001' }),
    ).rejects.toThrow();

    expect(db.cmd_members).toHaveLength(antes.membros);
    expect(db.cmd_users).toHaveLength(antes.usuarios);
  });

  it('o mesmo telefone em outro time é aceito: quem identifica o time é o link', async () => {
    await cadastrarPeloLink('token-marina', { name: 'João Silva', phone: '11911110001' });

    const { member } = await cadastrarPeloLink('token-candb', {
      name: 'Homônimo',
      phone: '11911110001',
    });

    expect(member.clientId).toBe(OPERACAO_B);
    expect(db.cmd_members.filter((row) => row.client_id === OPERACAO_B)).toHaveLength(1);
  });

  it('desfaz o integrante quando a criação do acesso falha', async () => {
    const invite = await resolveInvite('token-marina');
    const member = await createMember(
      {
        clientId: OPERACAO_A,
        name: 'Vai Falhar',
        phone: '11911110009',
        photo: null,
        responses: [],
        consentAt: null,
        source: 'invite',
      },
      invite?.owner
        ? { userId: invite.owner.userId, name: invite.owner.name, role: invite.owner.role }
        : null,
    );

    // Integrante que nao existe mais: a criacao do acesso quebra e o
    // cadastro recem-gravado nao pode sobrar.
    await expect(
      createMemberAccess({
        clientId: OPERACAO_A,
        memberId: 'm-inexistente',
        name: member.name,
        phone: member.phone,
      }),
    ).rejects.toThrow();

    await rollbackMember(member.id);
    expect(db.cmd_members.find((row) => row.id === member.id)).toBeUndefined();
    expect(db.cmd_invites.filter((row) => row.client_id === OPERACAO_A)).toHaveLength(1);
  });

  it('normaliza o telefone: somente dígitos, no cadastro e no acesso', async () => {
    const { member } = await cadastrarPeloLink('token-marina', {
      name: 'João Silva',
      phone: '  (11) 91111-0001  ',
    });

    expect(member.phone).toBe('11911110001');
    expect(db.cmd_users.find((row) => row.member_id === member.id)?.phone).toBe('11911110001');
  });
});

describe('escopo das consultas', () => {
  /** Monta a árvore: Marina -> João e Bruna; João -> Ana; Ana -> Carlos. */
  async function montarArvore() {
    const joao = await cadastrarPeloLink('token-marina', {
      name: 'João Silva',
      phone: '11911110001',
    });
    await cadastrarPeloLink('token-marina', { name: 'Bruna Costa', phone: '11911110003' });

    const joaoUser = db.cmd_users.find((row) => row.member_id === joao.member.id);
    const joaoToken = String(db.cmd_invites.find((row) => row.user_id === joaoUser?.id)?.token);

    const ana = await cadastrarPeloLink(joaoToken, {
      name: 'Ana Ribeiro',
      phone: '11911110002',
    });
    const anaUser = db.cmd_users.find((row) => row.member_id === ana.member.id);
    const anaToken = String(db.cmd_invites.find((row) => row.user_id === anaUser?.id)?.token);

    await cadastrarPeloLink(anaToken, { name: 'Carlos Dias', phone: '11911110004' });

    return {
      joaoUserId: String(joaoUser?.id),
      anaUserId: String(anaUser?.id),
    };
  }

  it('candidato vê todos os níveis da própria operação', async () => {
    await montarArvore();

    const marina = { id: 'u-marina', role: 'CANDIDATE' as const, candidateId: OPERACAO_A };
    const nomes = (await listMembersForUser(marina, OPERACAO_A)).map((m) => m.name);

    expect(nomes).toHaveLength(4);
    expect(nomes).toEqual(
      expect.arrayContaining(['João Silva', 'Bruna Costa', 'Ana Ribeiro', 'Carlos Dias']),
    );
  });

  it('EQUIPE vê apenas os próprios recrutados', async () => {
    const { joaoUserId, anaUserId } = await montarArvore();

    const joao = { id: joaoUserId, role: 'EQUIPE' as const, candidateId: OPERACAO_A };
    const vistos = (await listMembersForUser(joao, OPERACAO_A)).map((m) => m.name);

    expect(vistos).toEqual(['Ana Ribeiro']);
    // Nem irmaos, nem descendentes dos proprios recrutados.
    expect(vistos).not.toContain('Bruna Costa');
    expect(vistos).not.toContain('Carlos Dias');

    const ana = { id: anaUserId, role: 'EQUIPE' as const, candidateId: OPERACAO_A };
    expect((await listMembersForUser(ana, OPERACAO_A)).map((m) => m.name)).toEqual(['Carlos Dias']);
  });

  it('EQUIPE não alcança a lista de outra operação nem trocando o clientId', async () => {
    const { joaoUserId } = await montarArvore();
    const joao = { id: joaoUserId, role: 'EQUIPE' as const, candidateId: OPERACAO_A };

    await expect(listMembersForUser(joao, OPERACAO_B)).rejects.toMatchObject({ status: 403 });
    // Consulta direta com outro usuario tambem nao devolve nada dele.
    expect(await listMembersRecruitedBy('u-marina', OPERACAO_B)).toEqual([]);
  });

  it('mostra o estado do acesso de cada integrante', async () => {
    await cadastrarPeloLink('token-marina', { name: 'João Silva', phone: '11911110001' });

    // Integrante antigo, sem telefone: continua sem acesso.
    db.cmd_members.push({
      id: 'm-antigo',
      client_id: OPERACAO_A,
      name: 'Antiga Sem Telefone',
      phone: '',
      email: null,
      photo_path: null,
      recruited_by_user_id: null,
      recruited_by_name: null,
      recruited_by_role: null,
      source: 'invite',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const marina = { id: 'u-marina', role: 'CANDIDATE' as const, candidateId: OPERACAO_A };
    const porNome = new Map(
      (await listMembersForUser(marina, OPERACAO_A)).map((m) => [m.name, m]),
    );

    expect(porNome.get('João Silva')?.access).toBe('ACTIVE');
    expect(porNome.get('Antiga Sem Telefone')?.access).toBe('NO_PHONE');
    expect(porNome.get('Antiga Sem Telefone')?.recruitedBy).toBeNull();
  });
});

describe('link pessoal', () => {
  it('permanece o mesmo entre sessões: consultar não gera nem renova token', async () => {
    const { member } = await cadastrarPeloLink('token-marina', {
      name: 'João Silva',
      phone: '11911110001',
    });
    const user = db.cmd_users.find((row) => row.member_id === member.id);
    const primeiro = await findInviteByUser(String(user?.id));

    // Simula sair, entrar de novo e recarregar a pagina varias vezes.
    for (let i = 0; i < 3; i += 1) {
      const lido = await findInviteByUser(String(user?.id));
      expect(lido?.token).toBe(primeiro?.token);
      await ensurePersonalInvite(String(user?.id), OPERACAO_A);
    }

    expect(db.cmd_invites.filter((row) => row.user_id === user?.id)).toHaveLength(1);
    expect((await findInviteByUser(String(user?.id)))?.token).toBe(primeiro?.token);
  });

  it('adota o convite legado da operação em vez de criar outro', async () => {
    // Convite anterior a migration 012: sem dono e sem token visivel.
    db.cmd_invites.push({
      id: 'inv-legado',
      client_id: OPERACAO_B,
      user_id: null,
      token: null,
      token_hash: 'hash-legado',
      active: true,
      created_at: new Date().toISOString(),
      rotated_at: null,
    });
    db.cmd_invites = db.cmd_invites.filter((row) => row.id !== 'inv-candb');

    const adotado = await ensurePersonalInvite('u-candb', OPERACAO_B);

    expect(adotado.id).toBe('inv-legado');
    expect(adotado.user_id).toBe('u-candb');
    // O token antigo nao muda: nenhum link ja compartilhado deixa de valer.
    expect(adotado.token_hash).toBe('hash-legado');
    expect(db.cmd_invites.filter((row) => row.client_id === OPERACAO_B)).toHaveLength(1);
  });
});
