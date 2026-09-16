import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Chave de acesso do Time DEMO.
 *
 * A exigencia e de seguranca, e nao de tela: desligado o acesso, NENHUMA
 * pagina e NENHUMA rota podem resolver a sessao daquele time. Por isso a
 * conferencia vive em `resolveSessionState`, o unico ponto por onde todas
 * elas passam — e e la que este teste bate.
 */

interface SessionFixture {
  revoked_at: string | null;
  expires_at: string;
  is_active: boolean;
  role: 'ADMIN' | 'CANDIDATE' | 'EQUIPE';
  client: { is_demo: boolean; demo_access_enabled: boolean } | null;
}

let sessao: SessionFixture | null = null;

const AMANHA = new Date(Date.now() + 86_400_000).toISOString();

function fixture(patch: Partial<SessionFixture> = {}): SessionFixture {
  return {
    revoked_at: null,
    expires_at: AMANHA,
    is_active: true,
    role: 'CANDIDATE',
    client: { is_demo: true, demo_access_enabled: true },
    ...patch,
  };
}

vi.mock('@/lib/supabase/rest', () => ({
  selectOne: async (table: string) => {
    if (table !== 'cmd_sessions' || !sessao) return null;
    return {
      id: 'ses-1',
      expires_at: sessao.expires_at,
      revoked_at: sessao.revoked_at,
      admin_device_id: null,
      user: {
        id: 'u-1',
        name: 'Administradora do Time',
        email: null,
        role: sessao.role,
        client_id: sessao.client ? 'cli-demo' : null,
        member_id: null,
        team_person_id: sessao.role === 'CANDIDATE' ? 'tp-1' : null,
        must_change_password: false,
        is_active: sessao.is_active,
        team_person: { photo_path: null },
        client: sessao.client,
      },
    };
  },
  selectRows: async () => [],
  insertOne: async () => ({ id: 'x' }),
  updateRows: async () => [],
  deleteRows: async () => [],
  inFilter: (values: readonly string[]) => `in.(${values.join(',')})`,
  callFunction: async () => [],
}));

vi.mock('@/lib/supabase/storage', () => ({
  signedUrl: async () => null,
  signedUrls: async () => [],
}));

/**
 * O aparelho autorizado nao e o assunto aqui.
 *
 * Ele continua sendo conferido em toda sessao de Administrador do time — e a
 * ordem importa: a chave do Time DEMO e conferida ANTES, porque com o acesso
 * desligado nao ha aparelho que valha, e porque recusar por aparelho REVOGA
 * a sessao, o que faria religar o acesso nao devolver ninguem.
 */
vi.mock('@/lib/server/admin-device', () => ({
  ADMIN_DEVICE_COOKIE: 'cmd_admin_device',
  checkAdminDevice: async () => true,
}));

const { resolveSessionState, SESSION_BLOCK_MESSAGES } = await import('@/lib/server/auth.service');

beforeEach(() => {
  sessao = fixture();
});

describe('acesso do Time DEMO', () => {
  it('resolve normalmente com o acesso ligado', async () => {
    const state = await resolveSessionState('token-valido');

    expect(state.user?.id).toBe('u-1');
    expect(state.blocked).toBeNull();
  });

  it('não resolve sessão nenhuma com o acesso desligado', async () => {
    sessao = fixture({ client: { is_demo: true, demo_access_enabled: false } });

    const state = await resolveSessionState('token-valido');

    // Sem pessoa, toda rota e toda página negam: esconder o botão na tela
    // nunca foi proteção.
    expect(state.user).toBeNull();
    // E com motivo: é o que permite dizer "sua conta foi desconectada" em vez
    // de despejar a pessoa no login sem explicação.
    expect(state.blocked).toBe('DEMO_DESLIGADO');
    expect(SESSION_BLOCK_MESSAGES.DEMO_DESLIGADO).toContain('desconectada');
  });

  it('não desliga ninguém de um time real', async () => {
    // A coluna existe para o DEMO. Mesmo com o valor falso em um time real —
    // o que o `check` da migration 036 já recusa —, o acesso continua.
    sessao = fixture({ client: { is_demo: false, demo_access_enabled: false } });

    const state = await resolveSessionState('token-valido');

    expect(state.user?.id).toBe('u-1');
    expect(state.blocked).toBeNull();
  });

  it('não alcança o ADMIN geral, que não pertence a time nenhum', async () => {
    sessao = fixture({ role: 'ADMIN', client: null });

    const state = await resolveSessionState('token-valido');

    expect(state.user?.role).toBe('ADMIN');
    expect(state.blocked).toBeNull();
  });

  it('sessão revogada ou vencida continua sendo só sessão encerrada', async () => {
    // Sem motivo: quem saiu, ou cujo prazo acabou, vai para o login como
    // sempre foi. O aviso de desconexão é exclusivo do desligamento.
    sessao = fixture({ revoked_at: new Date().toISOString() });
    expect(await resolveSessionState('token-valido')).toEqual({ user: null, blocked: null });

    sessao = fixture({ expires_at: new Date(Date.now() - 1000).toISOString() });
    expect(await resolveSessionState('token-valido')).toEqual({ user: null, blocked: null });

    sessao = null;
    expect(await resolveSessionState('token-valido')).toEqual({ user: null, blocked: null });
    expect(await resolveSessionState(undefined)).toEqual({ user: null, blocked: null });
  });
});
