import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * A sessao resolve. Sempre.
 *
 * Duas maneiras de derrubar o sistema inteiro pela porta da frente, e as
 * duas ja aconteceram: o banco ATRASADO em relacao ao codigo, e o VINCULO
 * AMBIGUO entre duas tabelas. Cada uma tem cenario aqui.
 *
 * A sessao resolve com o banco ATRASADO em relacao ao codigo.
 *
 * Esta consulta e a porta de TODO o sistema: se ela falhar, ninguem entra
 * em lugar nenhum — o login aceita a senha e a proxima tela devolve a
 * pessoa para o login, sem explicacao. Publicar codigo que pede uma coluna
 * antes de rodar a migration e o caso mais comum de todos, e por isso ele
 * tem teste proprio.
 *
 * Cada coluna nova entra aqui como um cenario: o banco recusa aquela coluna
 * e a sessao precisa continuar resolvendo sem ela.
 */

/** Colunas que este "banco" ainda nao tem. */
const ausentes = new Set<string>();

/** O que cada consulta pediu, na ordem. */
const consultas: string[] = [];

/**
 * O erro do PostgREST, com a MESMA leitura do codigo real: a familia do
 * problema sai do `code` e, quando ele nao vem, do texto.
 */
class FakeRequestError extends Error {
  readonly code: string | null;
  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'SupabaseRequestError';
    this.code = code;
  }

  get isMissingSchema(): boolean {
    if (
      this.code === '42703' ||
      this.code === '42P01' ||
      this.code === 'PGRST202' ||
      this.code === 'PGRST204' ||
      this.code === 'PGRST205'
    ) {
      return true;
    }
    const texto = this.message.toLowerCase();
    return texto.includes('schema cache') || texto.includes('does not exist');
  }
}

/** Coluna que o banco ainda nao tem: a migration nao rodou. */
function colunaAusente(coluna: string): FakeRequestError {
  return new FakeRequestError(`column cmd_sessions.${coluna} does not exist`, '42703');
}

/**
 * Mais de UM caminho entre as tabelas.
 *
 * Nao e coluna faltando, nao e permissao e nao e dado: e a consulta que
 * ficou ambigua. O PostgREST responde 300 com PGRST201 e nao devolve linha
 * nenhuma — a sessao nao resolve, e todo mundo vai parar no login.
 */
function vinculoAmbiguo(): FakeRequestError {
  return new FakeRequestError(
    "Could not embed because more than one relationship was found for 'cmd_sessions' and 'cmd_users'",
    'PGRST201',
  );
}

/** A dica existe na consulta, mas esta versao do PostgREST nao a conhece. */
function dicaDesconhecida(): FakeRequestError {
  return new FakeRequestError(
    "Could not find a relationship between 'cmd_sessions' and 'cmd_users' using the hint 'user_id'",
    'PGRST200',
  );
}

/**
 * `cmd_sessions` aponta para `cmd_users` duas vezes desde a migration 045:
 * `user_id` (dono da sessao) e `impersonated_by` (quem a abriu). Dai em
 * diante, embutir `cmd_users` sem dizer POR QUAL caminho e ambiguo.
 */
const doisCaminhosParaUsuario = { ativo: true };

/**
 * Versao do PostgREST que nao aceita a dica pelo nome da COLUNA.
 *
 * Nao da para conferir isso contra o banco de verdade a partir dos testes,
 * entao o cenario existe: se a dica for recusada, a consulta ainda precisa
 * achar um formato que funcione, em vez de deixar todo mundo fora.
 */
const dicaRecusada = { ativo: false };

const SESSAO = {
  id: 'ses-1',
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  revoked_at: null,
  admin_device_id: null,
  user: {
    id: 'u-admin',
    name: 'Administradora',
    email: 'admin@exemplo.test',
    role: 'ADMIN',
    client_id: null,
    member_id: null,
    team_person_id: null,
    must_change_password: false,
    is_active: true,
    team_person: null,
  },
};

vi.mock('@/lib/supabase/rest', async () => {
  const real = await vi.importActual<typeof import('@/lib/supabase/rest')>(
    '@/lib/supabase/rest',
  );

  return {
    ...real,
    SupabaseRequestError: FakeRequestError,
    selectOne: async (table: string, options: { select?: string }) => {
      if (table !== 'cmd_sessions') return null;

      const select = options.select ?? '';
      consultas.push(select);

      for (const coluna of ausentes) {
        if (select.includes(coluna)) throw colunaAusente(coluna);
      }

      if (dicaRecusada.ativo && select.includes('!user_id')) throw dicaDesconhecida();

      // Sem a dica do caminho (`!user_id`), o banco com duas chaves
      // estrangeiras recusa a consulta inteira.
      if (doisCaminhosParaUsuario.ativo && select.includes('cmd_users(')) {
        throw vinculoAmbiguo();
      }

      return SESSAO;
    },
  };
});

vi.mock('@/lib/supabase/storage', () => ({ signedUrl: async () => null }));

vi.mock('@/lib/server/admin-device', () => ({
  ADMIN_DEVICE_COOKIE: 'cmd_aparelho',
  checkAdminDevice: async () => true,
}));

const { resolveSession } = await import('@/lib/server/auth.service');

const TOKEN = 'token-de-teste';

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

beforeEach(() => {
  ausentes.clear();
  consultas.length = 0;
  doisCaminhosParaUsuario.ativo = true;
  dicaRecusada.ativo = false;
});

describe('vínculo ambíguo entre sessão e usuário', () => {
  it('a consulta diz por qual caminho embute o usuário', async () => {
    // A migration 045 deu a `cmd_sessions` uma SEGUNDA chave estrangeira
    // para `cmd_users`. Sem a dica, o PostgREST recusa e ninguém entra —
    // exatamente o que este teste impede de voltar a acontecer.
    const user = await resolveSession(TOKEN);

    expect(user?.id).toBe('u-admin');
    expect(consultas.every((select) => select.includes('cmd_users!user_id('))).toBe(true);
  });

  it('se a dica for recusada, ainda acha um formato que o banco aceite', async () => {
    dicaRecusada.ativo = true;
    doisCaminhosParaUsuario.ativo = false;

    expect((await resolveSession(TOKEN))?.id).toBe('u-admin');
  });

  it('continua resolvendo em banco de um caminho só', async () => {
    // Banco anterior a 045: a dica nao atrapalha, ela apenas fixa a escolha.
    doisCaminhosParaUsuario.ativo = false;

    expect((await resolveSession(TOKEN))?.id).toBe('u-admin');
  });
});

describe('sessão com o banco atrasado', () => {
  it('resolve com o banco completo', async () => {
    const user = await resolveSession(TOKEN);

    expect(user?.id).toBe('u-admin');
    expect(consultas[0]).toContain('impersonated_by');
    expect(consultas[0]).toContain('demo_access_enabled');
  });

  it('resolve sem a migration 045: o login não pode cair por causa dela', async () => {
    ausentes.add('impersonated_by');

    const user = await resolveSession(TOKEN);

    expect(user?.id).toBe('u-admin');
    expect(user?.impersonatedBy).toBeNull();
    // Tentou com a coluna, o banco recusou, e a consulta seguinte foi sem
    // ela — e nao um erro na cara de quem estava entrando.
    expect(consultas.some((select) => !select.includes('impersonated_by'))).toBe(true);
  });

  it('resolve sem a migration 036, como já resolvia antes', async () => {
    ausentes.add('demo_access_enabled');

    expect((await resolveSession(TOKEN))?.id).toBe('u-admin');
  });

  it('resolve com as duas faltando ao mesmo tempo', async () => {
    ausentes.add('impersonated_by');
    ausentes.add('demo_access_enabled');

    expect((await resolveSession(TOKEN))?.id).toBe('u-admin');
  });

  it('o token vira hash antes de chegar ao banco', async () => {
    await resolveSession(TOKEN);
    expect(hash(TOKEN)).toHaveLength(64);
  });
});
