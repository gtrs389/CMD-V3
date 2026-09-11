import { beforeEach, describe, expect, it, vi } from 'vitest';
import { can, permissionsOf } from '@/lib/permissions';
import { createDefaultFormConfig, createField } from '@/lib/domain/form-config';
import { clientForSession, hiddenFormConfig } from '@/lib/server/form-visibility';
import type { Client, SessionUser } from '@/lib/types';

/**
 * Area interna do formulario: exclusiva do ADMIN.
 *
 * Os testes cobrem as tres camadas: a matriz de permissoes, a protecao das
 * rotas (403) e o que sai na resposta de cada perfil. Nenhum dado real e
 * usado.
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

const CANDIDATO: SessionUser = {
  id: 'u-cand',
  name: 'Candidata',
  email: 'candidata@exemplo.test',
  role: 'CANDIDATE',
  candidateId: 'cli-a',
  memberId: null,
  mustChangePassword: false,
};

const EQUIPE: SessionUser = {
  id: 'u-equipe',
  name: 'João',
  email: 'joao@exemplo.test',
  role: 'EQUIPE',
  candidateId: 'cli-a',
  memberId: 'mem-a',
  mustChangePassword: false,
};

/** Candidato com o formulario completo, como o ADMIN o configurou. */
function clienteComFormulario(): Client {
  const form = createDefaultFormConfig();
  const extra = {
    ...createField('text'),
    id: 'fld-extra',
    label: 'Região de atuação',
    placeholder: 'Zona Norte',
    helpText: 'Onde a pessoa atua',
    required: true,
    enabled: false,
    order: form.fields.length,
  };

  return {
    id: 'cli-a',
    name: 'Candidata',
    email: 'candidata@exemplo.test',
    photo: null,
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    invite: {
      token: 'tok-a',
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      rotatedAt: null,
    },
    form: { ...form, introText: 'Bem-vindo', fields: [...form.fields, extra] },
  };
}

describe('matriz de permissões do formulário', () => {
  it('deixa ver e administrar somente para o ADMIN', () => {
    expect(can(ADMIN, 'form.view')).toBe(true);
    expect(can(ADMIN, 'form.manage')).toBe(true);

    for (const user of [CANDIDATO, EQUIPE, null]) {
      expect(can(user, 'form.view')).toBe(false);
      expect(can(user, 'form.manage')).toBe(false);
    }
  });

  it('não deixa a permissão em nenhum outro perfil', () => {
    expect(permissionsOf('CANDIDATE')).not.toContain('form.view');
    expect(permissionsOf('CANDIDATE')).not.toContain('form.manage');
    expect(permissionsOf('EQUIPE')).not.toContain('form.view');
    expect(permissionsOf('EQUIPE')).not.toContain('form.manage');
  });

  it('mantém o resto do painel do candidato e da equipe', () => {
    // Visao geral, equipe e convite continuam abrindo normalmente.
    expect(can(CANDIDATO, 'client.view')).toBe(true);
    expect(can(CANDIDATO, 'member.view')).toBe(true);
    expect(can(CANDIDATO, 'invite.view')).toBe(true);

    expect(can(EQUIPE, 'team.access')).toBe(true);
    expect(can(EQUIPE, 'member.view')).toBe(true);
    // Continua copiando e compartilhando o proprio link.
    expect(can(EQUIPE, 'invite.view')).toBe(true);
    expect(can(EQUIPE, 'invite.submit')).toBe(true);
  });

  it('não mexe no envio pelo link público', () => {
    // O formulario publico nao depende da area interna: o visitante nao
    // esta autenticado e continua podendo enviar o cadastro.
    expect(can(null, 'invite.submit')).toBe(true);
  });
});

describe('resposta enviada ao navegador', () => {
  it('entrega a configuração completa ao ADMIN', () => {
    const client = clienteComFormulario();
    expect(clientForSession(ADMIN, client)).toBe(client);
  });

  it('não envia configuração, opções de ajuste nem estatística ao candidato', () => {
    const original = clienteComFormulario();
    const visto = clientForSession(CANDIDATO, original);

    expect(visto.form.introText).toBe('');
    expect(visto.form.successMessage).toBe('');
    expect(visto.form.updatedAt).toBe('');
    expect(visto.form.privacy).toEqual({
      enabled: false,
      title: '',
      text: '',
      requireConsent: false,
      consentLabel: '',
    });

    // Nenhuma contagem de campos ativos ou obrigatorios pode ser refeita:
    // todos os campos chegam com o mesmo valor.
    expect(visto.form.fields.every((field) => field.required === false)).toBe(true);
    expect(visto.form.fields.every((field) => field.enabled === true)).toBe(true);
    expect(visto.form.fields.every((field) => field.placeholder === '')).toBe(true);
    expect(visto.form.fields.every((field) => field.helpText === '')).toBe(true);

    // O original nao e alterado: o ADMIN continua vendo o campo desativado
    // e obrigatorio como ele configurou.
    const extra = original.form.fields.find((field) => field.id === 'fld-extra');
    expect(extra?.required).toBe(true);
    expect(extra?.enabled).toBe(false);
  });

  it('mantém apenas os rótulos que o candidato usa para ler a ficha da equipe', () => {
    const original = clienteComFormulario();
    const visto = clientForSession(CANDIDATO, original);

    const vinculo = visto.form.fields.find((field) => field.systemKey === 'relationship');
    expect(vinculo?.label).toBe(
      original.form.fields.find((field) => field.systemKey === 'relationship')?.label,
    );
    expect(vinculo?.options.length).toBeGreaterThan(0);

    expect(visto.form.fields.find((field) => field.id === 'fld-extra')?.label).toBe(
      'Região de atuação',
    );
  });

  it('não envia nada do formulário na área da equipe', () => {
    const vazio = hiddenFormConfig();

    expect(vazio.fields).toEqual([]);
    expect(vazio.introText).toBe('');
    expect(vazio.successMessage).toBe('');
    expect(vazio.updatedAt).toBe('');
    expect(vazio.privacy.enabled).toBe(false);
    expect(vazio.privacy.text).toBe('');
    // Cada chamada devolve o proprio objeto: nada compartilhado entre sessoes.
    expect(hiddenFormConfig().fields).not.toBe(vazio.fields);
  });

  it('não deixa o formulário público perder a configuração', () => {
    // A redacao acontece so na resposta do painel. A configuracao montada
    // para o link publico segue inteira: e ela que desenha o cadastro.
    const form = createDefaultFormConfig();
    expect(form.fields.length).toBeGreaterThan(0);
    expect(form.successMessage).not.toBe('');
    expect(form.fields.some((field) => field.required)).toBe(true);
  });
});

/* -------------------------------------------------------------------------
   Protecao das rotas, com sessao e banco simulados
   ------------------------------------------------------------------------- */

const estado: { user: SessionUser | null } = { user: null };

vi.mock('@/lib/server/auth.service', () => ({
  currentUser: async () => estado.user,
}));

vi.mock('@/lib/supabase/rest', () => ({
  selectOne: async () => null,
  selectRows: async () => [],
}));

const { requireClientAccess, requirePermission } = await import('@/lib/server/guard');

/** Codigo HTTP da falha, para conferir 401/403 sem depender da mensagem. */
async function statusOf(action: () => Promise<unknown>): Promise<number> {
  try {
    await action();
    return 200;
  } catch (error) {
    return (error as { status?: number }).status ?? 500;
  }
}

describe('rotas internas do formulário', () => {
  beforeEach(() => {
    estado.user = null;
  });

  it('recusam sem sessão', async () => {
    expect(await statusOf(() => requireClientAccess('form.manage', 'cli-a'))).toBe(401);
  });

  it('respondem 403 ao candidato, mesmo no próprio registro', async () => {
    estado.user = CANDIDATO;

    // Leitura e CRUD dos campos: requisicao montada na mao nao passa.
    expect(await statusOf(() => requireClientAccess('form.view', 'cli-a'))).toBe(403);
    expect(await statusOf(() => requireClientAccess('form.manage', 'cli-a'))).toBe(403);
    expect(await statusOf(() => requirePermission('form.view'))).toBe(403);
    expect(await statusOf(() => requirePermission('form.manage'))).toBe(403);
  });

  it('respondem 403 ao integrante da equipe', async () => {
    estado.user = EQUIPE;

    expect(await statusOf(() => requirePermission('form.view'))).toBe(403);
    expect(await statusOf(() => requirePermission('form.manage'))).toBe(403);
    // A EQUIPE nunca alcanca o registro do candidato, com ou sem permissao.
    expect(await statusOf(() => requireClientAccess('form.view', 'cli-a'))).toBe(403);
    expect(await statusOf(() => requireClientAccess('form.manage', 'cli-a'))).toBe(403);
  });

  it('continuam abertas ao ADMIN', async () => {
    estado.user = ADMIN;

    expect(await statusOf(() => requireClientAccess('form.view', 'cli-a'))).toBe(200);
    expect(await statusOf(() => requireClientAccess('form.manage', 'cli-a'))).toBe(200);
  });

  it('recusam o ADMIN com senha temporária pendente', async () => {
    estado.user = { ...ADMIN, mustChangePassword: true };
    expect(await statusOf(() => requireClientAccess('form.manage', 'cli-a'))).toBe(403);
  });
});
