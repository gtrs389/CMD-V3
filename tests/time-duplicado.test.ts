import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Time duplicado (migration 049).
 *
 * A promessa e uma so, e e a que este arquivo mais confere: NADA feito na
 * duplicacao — nem na copia depois dela — alcanca o oficial. Por isso o
 * banco daqui e um banco em memoria de verdade, e o oficial e fotografado
 * antes e comparado depois, linha a linha.
 *
 * Tambem conferido:
 *   - vao administradores, Lideres, formularios e configuracoes;
 *   - a Equipe dos Lideres fica so no oficial;
 *   - "Cadastrado por" do Lider aponta para o administrador DA COPIA;
 *   - nenhuma foto e compartilhada (trocar na copia apagaria a do oficial);
 *   - falha no meio desfaz so a copia;
 *   - a copia sai da Visao geral pelo mesmo recorte do Time DEMO.
 */

type Row = Record<string, unknown>;
type Tabela =
  | 'cmd_clients'
  | 'cmd_form_fields'
  | 'cmd_survey_fields'
  | 'cmd_team_people'
  | 'cmd_users'
  | 'cmd_members'
  | 'cmd_member_responses'
  | 'cmd_member_locations'
  | 'cmd_member_confirmations'
  | 'cmd_member_verifications'
  | 'cmd_survey_responses'
  | 'cmd_survey_response_values';

const db = new Map<string, Row[]>();
const arquivos = new Set<string>();
const falhas = { naTabela: null as string | null, semColunaCopia: false };
let seq = 0;

function tabela(nome: string): Row[] {
  if (!db.has(nome)) db.set(nome, []);
  return db.get(nome)!;
}

function lista(valor: string): string[] {
  return valor
    .slice(valor.indexOf('(') + 1, -1)
    .split(',')
    .map((item) => item.replace(/^"|"$/g, ''));
}

function casa(row: Row, filtros: Record<string, string>): boolean {
  return Object.entries(filtros).every(([chave, valor]) => {
    if (chave === 'or') {
      // So a forma usada pelo recorte: `(is_demo.is.true,is_copy.is.true)`.
      return lista(valor).some((parte) => {
        const [coluna, , alvo] = parte.split('.');
        return row[coluna] === (alvo === 'true');
      });
    }
    if (valor === 'is.true') return row[chave] === true;
    if (valor === 'is.false') return row[chave] === false || row[chave] === undefined;
    if (valor === 'is.null') return row[chave] === null || row[chave] === undefined;
    if (valor.startsWith('eq.')) return String(row[chave]) === valor.slice(3);
    if (valor.startsWith('not.in.')) return !lista(valor).includes(String(row[chave]));
    if (valor.startsWith('in.')) return lista(valor).includes(String(row[chave]));
    throw new Error(`filtro nao suportado: ${chave}=${valor}`);
  });
}

function selecionar(nome: string, options: { filters?: Record<string, string> } = {}): Row[] {
  if (falhas.semColunaCopia && nome === 'cmd_clients' && options.filters?.or) {
    throw new real.SupabaseRequestError('column cmd_clients.is_copy does not exist', 400, '42703');
  }
  return tabela(nome)
    .filter((row) => casa(row, options.filters ?? {}))
    .map((row) => ({ ...row }));
}

function inserir(nome: string, valores: Row[]): Row[] {
  if (falhas.naTabela === nome) throw new Error(`falha simulada em ${nome}`);
  if (falhas.semColunaCopia && nome === 'cmd_clients' && valores.some((v) => 'is_copy' in v)) {
    throw new real.SupabaseRequestError('column "is_copy" does not exist', 400, '42703');
  }
  const gravadas = valores.map((valor) => ({
    id: valor.id ?? `${nome}-${++seq}`,
    created_at: '2026-09-30T12:00:00.000Z',
    ...valor,
  }));
  tabela(nome).push(...gravadas);
  return gravadas.map((row) => ({ ...row }));
}

const real = await vi.importActual<typeof import('@/lib/supabase/rest')>('@/lib/supabase/rest');

vi.mock('@/lib/supabase/rest', async () => {
  const atual = await vi.importActual<typeof import('@/lib/supabase/rest')>('@/lib/supabase/rest');
  return {
    ...atual,
    selectRows: async (nome: string, options: { filters?: Record<string, string> }) =>
      selecionar(nome, options),
    selectOne: async (nome: string, options: { filters?: Record<string, string> }) =>
      selecionar(nome, options)[0] ?? null,
    insertRows: async (nome: string, valores: Row[]) => inserir(nome, valores),
    insertRowsInChunks: async (nome: string, valores: Row[]) => inserir(nome, valores),
    insertOne: async (nome: string, valor: Row) => inserir(nome, [valor])[0],
    updateRows: async () => {
      throw new Error('a duplicacao nao atualiza linha nenhuma');
    },
    deleteRows: async () => {
      throw new Error('a duplicacao nao apaga linha nenhuma diretamente');
    },
  };
});

vi.mock('@/lib/supabase/storage', () => ({
  copyImage: async (path: string | null) => {
    if (!path) return null;
    const novo = `${path.split('/')[0]}/copia-${++seq}.jpg`;
    arquivos.add(novo);
    return novo;
  },
  deleteImage: async (path: string | null) => {
    if (path) arquivos.delete(path);
  },
}));

vi.mock('@/lib/server/user.service', () => ({
  createTeamPersonUser: async (p: { clientId: string; personId: string; name: string; phone: string }) => {
    inserir('cmd_users', [
      { role: 'CANDIDATE', client_id: p.clientId, team_person_id: p.personId, name: p.name, phone: p.phone, is_active: true },
    ]);
  },
  createMemberAccess: async (p: { clientId: string; memberId: string; name: string; phone: string }) => {
    const [row] = inserir('cmd_users', [
      { role: 'EQUIPE', client_id: p.clientId, member_id: p.memberId, name: p.name, phone: p.phone, is_active: true },
    ]);
    return row.id as string;
  },
}));

vi.mock('@/lib/server/team-access.service', () => ({
  ensureTeamAccessLink: async () => ({}),
}));

/**
 * Excluir o time, como o banco faz: a linha do time e, em cascata, tudo o
 * que tem o `client_id` dele. Fotos do Storage saem junto, como no servico.
 */
vi.mock('@/lib/server/client.service', () => ({
  getClient: async (id: string) => ({ id }),
  deleteClient: async (id: string) => {
    for (const [nome, linhas] of db) {
      const ficam = linhas.filter((row) => (nome === 'cmd_clients' ? row.id !== id : row.client_id !== id));
      for (const sai of linhas.filter((row) => !ficam.includes(row))) {
        for (const chave of ['photo_path', 'banner_path']) {
          if (typeof sai[chave] === 'string') arquivos.delete(sai[chave] as string);
        }
      }
      db.set(nome, ficam);
    }
  },
}));

const { duplicateTeam, copyName, isLeaderRow } = await import('@/lib/server/team-copy.service');
const { offBooksClientIds, withoutDemoClients } = await import('@/lib/server/demo-scope');

const OFICIAL = 'time-oficial';

function semear() {
  db.clear();
  arquivos.clear();
  falhas.naTabela = null;
  falhas.semColunaCopia = false;
  seq = 0;

  arquivos.add('clients/foto-oficial.jpg');
  arquivos.add('banners/banner-oficial.jpg');
  arquivos.add('team-people/ana.jpg');
  arquivos.add('members/lider-1.jpg');

  tabela('cmd_clients').push({
    id: OFICIAL,
    name: 'Time Oficial',
    is_demo: false,
    is_copy: false,
    copy_of_client_id: null,
    copy_of_name: null,
    photo_path: 'clients/foto-oficial.jpg',
    photo_mime: 'image/jpeg',
    photo_size: 10,
    banner_path: 'banners/banner-oficial.jpg',
    banner_mime: 'image/jpeg',
    banner_size: 20,
    privacy_text: 'Aviso de privacidade do oficial',
    verification_enabled: false,
    survey_title: 'Formulário 2 do oficial',
    state_uf: 'AL',
    cities: ['Palmeira dos Índios'],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  });
  tabela('cmd_form_fields').push(
    { id: 'campo-nome', client_id: OFICIAL, system_key: 'name', label: 'Nome', position: 0 },
    { id: 'campo-livre', client_id: OFICIAL, system_key: null, label: 'Igreja', position: 1 },
  );
  tabela('cmd_survey_fields').push({ id: 'pergunta-1', client_id: OFICIAL, label: 'Quantos votos?', position: 0 });
  tabela('cmd_team_people').push({
    id: 'pessoa-ana',
    client_id: OFICIAL,
    name: 'Ana Administradora',
    phone: '82999990001',
    photo_path: 'team-people/ana.jpg',
    photo_mime: 'image/jpeg',
    photo_size: 5,
    position: 0,
  });
  tabela('cmd_users').push(
    { id: 'admin-geral', role: 'ADMIN', client_id: null },
    { id: 'user-ana', role: 'CANDIDATE', client_id: OFICIAL, team_person_id: 'pessoa-ana', phone: '82999990001' },
    { id: 'user-lider-1', role: 'EQUIPE', client_id: OFICIAL, member_id: 'lider-1', phone: '82988880001' },
  );
  tabela('cmd_members').push(
    {
      id: 'lider-1',
      client_id: OFICIAL,
      name: 'Líder Um',
      phone: '82988880001',
      email: 'lider1@exemplo.test',
      photo_path: 'members/lider-1.jpg',
      photo_mime: 'image/jpeg',
      photo_size: 7,
      tag: 'ZONA NORTE',
      recruited_by_user_id: 'user-ana',
      recruited_by_name: 'Ana Administradora',
      recruited_by_role: 'CANDIDATE',
      recruiter_changed_by: null,
      created_at: '2026-02-01T00:00:00.000Z',
    },
    {
      id: 'lider-2',
      client_id: OFICIAL,
      name: 'Líder Dois',
      phone: '82988880002',
      email: null,
      photo_path: null,
      tag: null,
      recruited_by_user_id: 'admin-geral',
      recruited_by_name: 'Admin Geral',
      recruited_by_role: 'ADMIN',
      recruiter_changed_by: 'admin-geral',
      created_at: '2026-02-02T00:00:00.000Z',
    },
    {
      id: 'equipe-1',
      client_id: OFICIAL,
      name: 'Pessoa da Equipe',
      phone: '82977770001',
      email: null,
      photo_path: null,
      recruited_by_user_id: 'user-lider-1',
      recruited_by_name: 'Líder Um',
      recruited_by_role: 'EQUIPE',
      created_at: '2026-03-01T00:00:00.000Z',
    },
  );
  tabela('cmd_member_responses').push(
    { id: 'resp-1', client_id: OFICIAL, member_id: 'lider-1', field_id: 'campo-livre', value: 'Batista' },
    { id: 'resp-2', client_id: OFICIAL, member_id: 'equipe-1', field_id: 'campo-livre', value: 'Católica' },
  );
  tabela('cmd_member_locations').push({
    id: 'loc-1',
    client_id: OFICIAL,
    member_id: 'lider-1',
    location_kind: 'RESIDENCE',
    status: 'SUCCESS',
    location_id: 'ponto-compartilhado',
    locked_at: null,
    lock_token: null,
  });
  tabela('cmd_member_confirmations').push({
    id: 'conf-1',
    client_id: OFICIAL,
    member_id: 'lider-1',
    notice_hash: 'abc',
  });
  tabela('cmd_member_verifications').push(
    { id: 'ver-1', client_id: OFICIAL, member_id: 'lider-1', status: 'COMPLETED', cpf_payload: 'cifrado' },
    { id: 'ver-2', client_id: OFICIAL, member_id: 'lider-2', status: 'PENDING', cpf_payload: null },
  );
  tabela('cmd_survey_responses').push(
    // Lider Dois nasceu pelo Formulario 2, no painel: a resposta e dele.
    { id: 'f2-lider', client_id: OFICIAL, member_id: 'lider-2', invite_id: null, sender_user_id: 'user-ana', sender_role: 'CANDIDATE', name: 'Líder Dois' },
    // Resposta por link: nao e de integrante nenhum, e fica no oficial.
    { id: 'f2-link', client_id: OFICIAL, member_id: null, invite_id: 'convite-1', sender_user_id: 'user-ana', sender_role: 'CANDIDATE', name: 'Visitante' },
  );
  tabela('cmd_survey_response_values').push(
    { id: 'v-1', response_id: 'f2-lider', field_id: 'pergunta-1', field_label: 'Quantos votos?', value: '40' },
    { id: 'v-2', response_id: 'f2-link', field_id: 'pergunta-1', field_label: 'Quantos votos?', value: '3' },
  );
}

/** Fotografia de TUDO o que pertence ao oficial, para comparar depois. */
function fotografiaDoOficial() {
  const foto: Record<string, Row[]> = {};
  for (const [nome, linhas] of db) {
    foto[nome] = structuredClone(
      linhas.filter((row) =>
        nome === 'cmd_clients'
          ? row.id === OFICIAL
          : nome === 'cmd_survey_response_values'
            ? ['f2-lider', 'f2-link'].includes(row.response_id as string)
            : row.client_id === OFICIAL || row.client_id === null,
      ),
    );
  }
  return foto;
}

function daCopia(nome: Tabela, copiaId: string): Row[] {
  return tabela(nome).filter((row) => row.client_id === copiaId);
}

beforeEach(semear);

describe('duplicar um time', () => {
  it('o oficial sai EXATAMENTE como entrou', async () => {
    const antes = fotografiaDoOficial();
    const arquivosAntes = new Set(arquivos);

    await duplicateTeam(OFICIAL, { name: 'Ensaio' });

    expect(fotografiaDoOficial()).toEqual(antes);
    for (const arquivo of arquivosAntes) expect(arquivos.has(arquivo)).toBe(true);
  });

  it('marca a cópia e guarda de onde ela veio', async () => {
    const { client } = await duplicateTeam(OFICIAL, { name: '  Ensaio   da   planilha ' });
    const [copia] = selecionar('cmd_clients', { filters: { id: `eq.${client.id}` } });

    expect(copia.id).not.toBe(OFICIAL);
    expect(copia.name).toBe('Ensaio da planilha');
    expect(copia.is_copy).toBe(true);
    expect(copia.is_demo).toBeUndefined();
    expect(copia.copy_of_client_id).toBe(OFICIAL);
    expect(copia.copy_of_name).toBe('Time Oficial');
    // Configuracoes vao junto.
    expect(copia.privacy_text).toBe('Aviso de privacidade do oficial');
    expect(copia.verification_enabled).toBe(false);
    expect(copia.survey_title).toBe('Formulário 2 do oficial');
    expect(copia.cities).toEqual(['Palmeira dos Índios']);
  });

  it('leva os dois formulários e os administradores, com acesso próprio', async () => {
    const { client, admins } = await duplicateTeam(OFICIAL);

    expect(daCopia('cmd_form_fields', client.id).map((row) => row.label)).toEqual(['Nome', 'Igreja']);
    expect(daCopia('cmd_survey_fields', client.id).map((row) => row.label)).toEqual(['Quantos votos?']);

    expect(admins).toBe(1);
    const [pessoa] = daCopia('cmd_team_people', client.id);
    expect(pessoa.id).not.toBe('pessoa-ana');
    expect(pessoa.name).toBe('Ana Administradora');

    const usuarios = daCopia('cmd_users', client.id);
    expect(usuarios.find((u) => u.role === 'CANDIDATE')?.team_person_id).toBe(pessoa.id);
  });

  it('leva só os Líderes: a Equipe deles fica no oficial', async () => {
    const { client, leaders } = await duplicateTeam(OFICIAL);
    const nomes = daCopia('cmd_members', client.id).map((row) => row.name);

    expect(leaders).toBe(2);
    expect(nomes).toEqual(['Líder Um', 'Líder Dois']);
    expect(nomes).not.toContain('Pessoa da Equipe');
    expect(daCopia('cmd_member_responses', client.id).map((row) => row.value)).toEqual(['Batista']);
  });

  it('"Cadastrado por" do Líder aponta para o administrador DA CÓPIA', async () => {
    const { client } = await duplicateTeam(OFICIAL);
    const adminDaCopia = daCopia('cmd_users', client.id).find((u) => u.role === 'CANDIDATE')!;
    const [um, dois] = daCopia('cmd_members', client.id);

    expect(um.recruited_by_user_id).toBe(adminDaCopia.id);
    expect(um.recruited_by_name).toBe('Ana Administradora');
    expect(um.tag).toBe('ZONA NORTE');
    // ADMIN geral nao tem time: continua o mesmo.
    expect(dois.recruited_by_user_id).toBe('admin-geral');
    expect(dois.recruiter_changed_by).toBe('admin-geral');

    // Nenhuma linha da copia aponta para usuario ou integrante do oficial.
    const doOficial = new Set(selecionar('cmd_users', { filters: { client_id: `eq.${OFICIAL}` } }).map((u) => u.id));
    for (const row of daCopia('cmd_members', client.id)) {
      expect(doOficial.has(String(row.recruited_by_user_id))).toBe(false);
    }
  });

  it('respostas, mapa, confirmação e verificação apontam para as linhas da cópia', async () => {
    const { client } = await duplicateTeam(OFICIAL);
    const campos = new Set(daCopia('cmd_form_fields', client.id).map((row) => row.id));
    const pessoas = new Set(daCopia('cmd_members', client.id).map((row) => row.id));

    for (const row of daCopia('cmd_member_responses', client.id)) {
      expect(campos.has(row.field_id as string)).toBe(true);
      expect(pessoas.has(row.member_id as string)).toBe(true);
    }
    const [local] = daCopia('cmd_member_locations', client.id);
    expect(pessoas.has(local.member_id as string)).toBe(true);
    expect(local.location_id).toBe('ponto-compartilhado');

    expect(daCopia('cmd_member_confirmations', client.id)).toHaveLength(1);
    // Verificacao pendente nao vai: faria a copia pagar de novo a consulta.
    const verificacoes = daCopia('cmd_member_verifications', client.id);
    expect(verificacoes.map((row) => row.status)).toEqual(['COMPLETED']);
  });

  it('leva o Formulário 2 do próprio Líder, e não as respostas por link', async () => {
    const { client } = await duplicateTeam(OFICIAL);
    const respostas = daCopia('cmd_survey_responses', client.id);
    const pergunta = daCopia('cmd_survey_fields', client.id)[0];
    const lider = daCopia('cmd_members', client.id).find((row) => row.name === 'Líder Dois')!;
    const adminDaCopia = daCopia('cmd_users', client.id).find((u) => u.role === 'CANDIDATE')!;

    expect(respostas).toHaveLength(1);
    expect(respostas[0].member_id).toBe(lider.id);
    expect(respostas[0].invite_id).toBeNull();
    expect(respostas[0].sender_user_id).toBe(adminDaCopia.id);

    const valores = tabela('cmd_survey_response_values').filter((row) => row.response_id === respostas[0].id);
    expect(valores).toHaveLength(1);
    expect(valores[0].value).toBe('40');
    expect(valores[0].field_id).toBe(pergunta.id);
  });

  it('dá acesso aos Líderes na cópia, para subir a planilha pelo painel deles', async () => {
    const { client, leadersWithoutAccess } = await duplicateTeam(OFICIAL);
    const lideres = daCopia('cmd_users', client.id).filter((u) => u.role === 'EQUIPE');

    expect(lideres).toHaveLength(2);
    expect(leadersWithoutAccess).toBe(0);
  });

  it('nenhuma foto é compartilhada com o oficial', async () => {
    const { client } = await duplicateTeam(OFICIAL);
    const [copia] = selecionar('cmd_clients', { filters: { id: `eq.${client.id}` } });
    const caminhos = [
      copia.photo_path,
      copia.banner_path,
      ...daCopia('cmd_team_people', client.id).map((row) => row.photo_path),
      ...daCopia('cmd_members', client.id).map((row) => row.photo_path),
    ].filter(Boolean);

    expect(caminhos).toHaveLength(4);
    for (const caminho of caminhos) {
      expect(caminho).toMatch(/copia-/);
      expect(arquivos.has(caminho as string)).toBe(true);
    }
  });

  it('e-mail não vai para a cópia: ele é único no sistema', async () => {
    const { client } = await duplicateTeam(OFICIAL);
    for (const row of daCopia('cmd_members', client.id)) expect(row.email).toBeNull();
  });

  it('excluir a cópia não tira nada do oficial', async () => {
    const antes = fotografiaDoOficial();
    const { client } = await duplicateTeam(OFICIAL);
    const { deleteClient } = await import('@/lib/server/client.service');

    await deleteClient(client.id);

    expect(fotografiaDoOficial()).toEqual(antes);
    for (const arquivo of ['clients/foto-oficial.jpg', 'banners/banner-oficial.jpg', 'team-people/ana.jpg', 'members/lider-1.jpg']) {
      expect(arquivos.has(arquivo)).toBe(true);
    }
  });

  it('falha no meio desfaz só a cópia', async () => {
    const antes = fotografiaDoOficial();
    falhas.naTabela = 'cmd_member_responses';

    await expect(duplicateTeam(OFICIAL)).rejects.toThrow('falha simulada');

    expect(fotografiaDoOficial()).toEqual(antes);
    expect(selecionar('cmd_clients')).toHaveLength(1);
    expect(tabela('cmd_members').every((row) => row.client_id === OFICIAL)).toBe(true);
  });

  it('banco sem a migration 049 recusa com o que fazer, sem escrever nada', async () => {
    falhas.semColunaCopia = true;

    await expect(duplicateTeam(OFICIAL)).rejects.toThrow('049_time_duplicado.sql');
    expect(selecionar('cmd_clients')).toHaveLength(1);
  });

  it('time DEMO não é duplicado', async () => {
    tabela('cmd_clients')[0].is_demo = true;
    await expect(duplicateTeam(OFICIAL)).rejects.toThrow('Time DEMO');
  });
});

describe('a cópia fica fora da Visão geral', () => {
  it('entra no mesmo recorte do Time DEMO', async () => {
    const { client } = await duplicateTeam(OFICIAL);

    expect(await offBooksClientIds()).toEqual([client.id]);
    expect((await withoutDemoClients()).client_id).toBe(`not.in.("${client.id}")`);
  });

  it('banco sem a migration 049 continua funcionando só com o DEMO', async () => {
    falhas.semColunaCopia = true;
    expect(await offBooksClientIds()).toEqual([]);
  });
});

describe('regras pequenas', () => {
  it('nome da cópia', () => {
    expect(copyName('Time Oficial')).toBe('Time Oficial (duplicado)');
    expect(copyName('Time Oficial', ' ')).toBe('Time Oficial (duplicado)');
    expect(copyName('Time Oficial', 'Ensaio')).toBe('Ensaio');
  });

  it('Líder é quem não foi cadastrado por um Líder', () => {
    expect(isLeaderRow({ recruited_by_role: 'CANDIDATE' })).toBe(true);
    expect(isLeaderRow({ recruited_by_role: 'ADMIN' })).toBe(true);
    expect(isLeaderRow({ recruited_by_role: null })).toBe(true);
    expect(isLeaderRow({ recruited_by_role: 'EQUIPE' })).toBe(false);
  });
});
