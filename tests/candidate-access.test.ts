import { beforeEach, describe, expect, it, vi } from 'vitest';
import { can, canReachClient, hasPanelAccess, permissionsOf, ROLE_LABELS } from '@/lib/permissions';
import { homePathFor, FIRST_ACCESS_PATH, LOGIN_PATH } from '@/lib/auth/constants';
import { firstAccessSchema } from '@/lib/validation/auth.schema';
import { generateTempPassword, TEMP_PASSWORD_LENGTH } from '@/lib/auth/temp-password';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import type { SessionUser } from '@/lib/types';

/**
 * Acesso do candidato.
 *
 * Nenhum dado real e usado. O objetivo e provar que o candidato so alcanca o
 * proprio registro, que o ADMIN continua com acesso total e que a senha
 * temporaria nunca vira texto puro no banco.
 */

const ADMIN: SessionUser = {
  id: 'u-admin',
  name: 'Administradora',
  email: 'admin@exemplo.test',
  role: 'ADMIN',
  candidateId: null,
  memberId: null,
  mustChangePassword: false,
};

const CANDIDATO_A: SessionUser = {
  id: 'u-a',
  name: 'Candidato A',
  email: 'a@exemplo.test',
  role: 'CANDIDATE',
  candidateId: 'cli-a',
  memberId: null,
  mustChangePassword: false,
};

const CANDIDATO_B: SessionUser = { ...CANDIDATO_A, id: 'u-b', candidateId: 'cli-b' };

describe('perfil Candidato', () => {
  it('é exibido como Administrador do time e entra no painel', () => {
    expect(ROLE_LABELS.CANDIDATE).toBe('Administrador do time');
    expect(hasPanelAccess(CANDIDATO_A)).toBe(true);
    expect(hasPanelAccess(ADMIN)).toBe(true);
  });

  it('lê apenas o que é da própria equipe', () => {
    // O mapa entra como leitura: o recorte por operação é imposto pelo
    // servidor, a partir da sessão.
    for (const permissao of ['client.view', 'member.view', 'invite.view', 'map.view'] as const) {
      expect(can(CANDIDATO_A, permissao)).toBe(true);
    }
  });

  it('não recebe nenhuma permissão de escrita ou de visão global', () => {
    const proibidas = [
      'admin.access',
      'dashboard.view',
      'client.list',
      'client.create',
      'client.update',
      'client.delete',
      // Area interna do formulario: exclusiva do ADMIN.
      'form.view',
      'form.manage',
      'invite.manage',
      // Cadastrar a mao ELE PODE. Corrigir cadastro alheio e apagar
      // historico continuam sendo decisao do ADMIN.
      'member.update',
      'member.delete',
      'verification.view',
      'verification.retry',
      'device.view',
      // Localizar cadastro pendente aciona consulta paga: só o ADMIN.
      'map.resolve',
      'settings.view',
      'settings.manage',
    ] as const;

    for (const permissao of proibidas) {
      expect(can(CANDIDATO_A, permissao)).toBe(false);
    }
  });

  it('cadastra integrante a mao, e so no proprio time', () => {
    // Nem toda pessoa se cadastra sozinha pelo link: o Administrador do time
    // registra quem esta na frente dele.
    expect(can(CANDIDATO_A, 'member.create')).toBe(true);

    // O poder para no proprio time — e e o servidor que confere as duas
    // coisas, permissao e alcance, em `requireClientAccess`.
    expect(canReachClient(CANDIDATO_A, 'cli-a')).toBe(true);
    expect(canReachClient(CANDIDATO_A, 'cli-b')).toBe(false);
  });

  it('mantém o ADMIN com acesso total', () => {
    for (const permissao of permissionsOf('ADMIN')) {
      expect(can(ADMIN, permissao)).toBe(true);
    }
    expect(can(ADMIN, 'settings.manage')).toBe(true);
  });

  it('não alcança o registro de outro candidato', () => {
    expect(canReachClient(CANDIDATO_A, 'cli-a')).toBe(true);
    expect(canReachClient(CANDIDATO_A, 'cli-b')).toBe(false);
    expect(canReachClient(CANDIDATO_B, 'cli-a')).toBe(false);
    expect(canReachClient({ ...CANDIDATO_A, candidateId: null }, 'cli-a')).toBe(false);
    expect(canReachClient(null, 'cli-a')).toBe(false);

    // O ADMIN continua alcançando qualquer registro.
    expect(canReachClient(ADMIN, 'cli-a')).toBe(true);
    expect(canReachClient(ADMIN, 'cli-b')).toBe(true);
  });

  it('leva cada perfil para a própria página inicial', () => {
    expect(homePathFor(ADMIN)).toBe('/dashboard');
    expect(homePathFor(CANDIDATO_A)).toBe('/candidatos/cli-a');
    expect(homePathFor({ ...CANDIDATO_A, mustChangePassword: true })).toBe(FIRST_ACCESS_PATH);
    expect(homePathFor({ ...ADMIN, mustChangePassword: true })).toBe(FIRST_ACCESS_PATH);
    expect(homePathFor(null)).toBe(LOGIN_PATH);
  });
});

describe('senha temporária', () => {
  it('é sorteada, forte e sem caracteres ambíguos', () => {
    const senhas = new Set<string>();

    for (let i = 0; i < 50; i += 1) {
      const senha = generateTempPassword();
      senhas.add(senha);

      expect(senha).toHaveLength(TEMP_PASSWORD_LENGTH);
      expect(senha).toMatch(/[a-z]/);
      expect(senha).toMatch(/[A-Z]/);
      expect(senha).toMatch(/[2-9]/);
      expect(senha).toMatch(/[!@#$%&*\-+]/);
      // Nada de 0, O, 1, l ou I: a senha precisa poder ser ditada.
      expect(senha).not.toMatch(/[0O1lI]/);
    }

    expect(senhas.size).toBe(50);
  });

  it('só chega ao banco como hash scrypt', async () => {
    const senha = generateTempPassword();
    const hash = await hashPassword(senha);

    expect(hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(hash).not.toContain(senha);
    expect(await verifyPassword(senha, hash)).toBe(true);
    expect(await verifyPassword(`${senha}x`, hash)).toBe(false);
  });

  it('acesso pendente não tem senha utilizável', async () => {
    expect(await verifyPassword(generateTempPassword(), null)).toBe(false);
    expect(await verifyPassword('', null)).toBe(false);
  });
});

describe('primeiro acesso', () => {
  it('exige confirmação igual e o mínimo de caracteres', () => {
    expect(
      firstAccessSchema.safeParse({ newPassword: 'senha-forte-1', confirmPassword: 'senha-forte-1' })
        .success,
    ).toBe(true);

    const curta = firstAccessSchema.safeParse({ newPassword: 'abc', confirmPassword: 'abc' });
    expect(curta.success).toBe(false);

    const diferente = firstAccessSchema.safeParse({
      newPassword: 'senha-forte-1',
      confirmPassword: 'senha-forte-2',
    });
    expect(diferente.success).toBe(false);
    expect(diferente.error?.issues[0]?.message).toBe('As senhas não conferem.');
  });
});

/* -------------------------------------------------------------------------
   Protecao das rotas, com sessao e banco simulados
   ------------------------------------------------------------------------- */

const estado: { user: SessionUser | null; membros: Record<string, string> } = {
  user: null,
  membros: { 'mem-a': 'cli-a', 'mem-b': 'cli-b' },
};

vi.mock('@/lib/server/auth.service', () => ({
  currentUser: async () => estado.user,
}));

vi.mock('@/lib/supabase/rest', () => ({
  selectOne: async (_table: string, options: { filters?: Record<string, string> }) => {
    const id = (options.filters?.id ?? '').replace('eq.', '');
    const clientId = estado.membros[id];
    // Nenhum destes integrantes tem origem registrada: o candidato continua
    // alcancando todos, e a EQUIPE, nenhum.
    return clientId ? { id, client_id: clientId, recruited_by_user_id: null } : null;
  },
  selectRows: async () => [],
}));

const { requireClientAccess, requireMemberAccess, requirePermission } = await import(
  '@/lib/server/guard'
);

/** Codigo HTTP da falha, para conferir 401/403 sem depender da mensagem. */
async function statusOf(action: () => Promise<unknown>): Promise<number> {
  try {
    await action();
    return 200;
  } catch (error) {
    return (error as { status?: number }).status ?? 500;
  }
}

describe('proteção no servidor', () => {
  beforeEach(() => {
    estado.user = null;
  });

  it('recusa sem sessão', async () => {
    expect(await statusOf(() => requireClientAccess('client.view', 'cli-a'))).toBe(401);
  });

  it('deixa o candidato abrir apenas o próprio registro', async () => {
    estado.user = CANDIDATO_A;

    expect(await statusOf(() => requireClientAccess('client.view', 'cli-a'))).toBe(200);
    expect(await statusOf(() => requireClientAccess('client.view', 'cli-b'))).toBe(403);
  });

  it('recusa o candidato em rota de escrita ou de outro escopo', async () => {
    estado.user = CANDIDATO_A;

    expect(await statusOf(() => requireClientAccess('client.update', 'cli-a'))).toBe(403);
    expect(await statusOf(() => requirePermission('client.list'))).toBe(403);
    expect(await statusOf(() => requirePermission('settings.view'))).toBe(403);
    expect(await statusOf(() => requirePermission('map.resolve'))).toBe(403);
  });

  it('confere o vínculo do integrante pelo banco', async () => {
    estado.user = CANDIDATO_A;

    expect(await statusOf(() => requireMemberAccess('member.view', 'mem-a'))).toBe(200);
    expect(await statusOf(() => requireMemberAccess('member.view', 'mem-b'))).toBe(403);
    expect(await statusOf(() => requireMemberAccess('verification.view', 'mem-a'))).toBe(403);
    expect(await statusOf(() => requireMemberAccess('device.view', 'mem-a'))).toBe(403);
  });

  it('bloqueia tudo enquanto a senha temporária não for trocada', async () => {
    estado.user = { ...CANDIDATO_A, mustChangePassword: true };

    expect(await statusOf(() => requireClientAccess('client.view', 'cli-a'))).toBe(403);
    expect(await statusOf(() => requirePermission('client.view'))).toBe(403);

    estado.user = { ...ADMIN, mustChangePassword: true };
    expect(await statusOf(() => requirePermission('dashboard.view'))).toBe(403);
  });

  it('mantém o ADMIN alcançando qualquer registro', async () => {
    estado.user = ADMIN;

    expect(await statusOf(() => requireClientAccess('client.view', 'cli-b'))).toBe(200);
    expect(await statusOf(() => requireClientAccess('client.delete', 'cli-a'))).toBe(200);
    expect(await statusOf(() => requireMemberAccess('verification.view', 'mem-b'))).toBe(200);
    expect(await statusOf(() => requirePermission('settings.manage'))).toBe(200);
  });
});
