import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * O ADMIN geral entra no painel de uma pessoa do time (migration 045).
 *
 * A sessao aberta e de verdade, entao o que se prova aqui e o contorno
 * dela: quem pode ser alvo, o que vai parar no banco, que o token nunca e
 * gravado em texto puro e que a autorizacao vale UMA vez.
 *
 * Nenhuma chamada real ao Supabase acontece: o banco e um objeto em
 * memoria, e as funcoes do banco sao reproduzidas com a mesma regra.
 */

interface Row {
  [key: string]: unknown;
}

const db: { users: Row[]; impersonations: Row[]; sessions: Row[] } = {
  users: [],
  impersonations: [],
  sessions: [],
};

/** As chamadas a `cmd_impersonation_claim` e `cmd_impersonation_end`. */
const chamadas: { nome: string; args: Record<string, unknown> }[] = [];

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

vi.mock('@/lib/supabase/rest', () => ({
  selectOne: async (table: string, options: { filters?: Record<string, string> }) => {
    if (table !== 'cmd_users') return null;
    const id = String(options.filters?.id ?? '').slice(3);
    return db.users.find((row) => row.id === id) ?? null;
  },
  insertOne: async (table: string, value: Row) => {
    if (table === 'cmd_impersonations') db.impersonations.push({ id: 'imp-1', ...value });
    return { id: 'imp-1' };
  },
  callFunction: async (nome: string, args: Record<string, unknown>) => {
    chamadas.push({ nome, args });

    if (nome === 'cmd_impersonation_claim') {
      // A mesma regra da funcao do banco: autorizacao viva, ainda nao
      // usada, e pessoa ativa de um perfil que tem painel.
      const auth = db.impersonations.find(
        (row) =>
          row.token_hash === args.p_token_hash &&
          !row.started_at &&
          new Date(String(row.expires_at)).getTime() > Date.now(),
      );
      if (!auth) return [];

      auth.started_at = new Date().toISOString();

      const alvo = db.users.find(
        (row) =>
          row.id === auth.target_user_id &&
          row.is_active === true &&
          (row.role === 'CANDIDATE' || row.role === 'EQUIPE'),
      );
      if (!alvo) return [];

      db.sessions.push({
        id: 'ses-1',
        user_id: alvo.id,
        token_hash: args.p_session_token_hash,
        expires_at: args.p_expires_at,
        impersonated_by: auth.admin_user_id,
      });

      return [{ impersonation_id: auth.id, session_id: 'ses-1', target_user_id: alvo.id }];
    }

    if (nome === 'cmd_impersonation_end') {
      const sessao = db.sessions.find(
        (row) => row.token_hash === args.p_session_token_hash && row.impersonated_by,
      );
      if (!sessao) return false;
      sessao.revoked_at = new Date().toISOString();
      return true;
    }

    return null;
  },
}));

const { claimImpersonation, endImpersonation, grantImpersonation } = await import(
  '@/lib/server/impersonation.service'
);

const ADMIN = { id: 'u-admin', name: 'Administradora', role: 'ADMIN' } as const;

beforeEach(() => {
  db.users = [
    { id: 'u-admin', name: 'Administradora', role: 'ADMIN', client_id: null, is_active: true },
    { id: 'u-time', name: 'Marina', role: 'CANDIDATE', client_id: 'cli-1', is_active: true },
    { id: 'u-equipe', name: 'João', role: 'EQUIPE', client_id: 'cli-1', is_active: true },
    { id: 'u-fora', name: 'Desligado', role: 'EQUIPE', client_id: 'cli-1', is_active: false },
  ];
  db.impersonations = [];
  db.sessions = [];
  chamadas.length = 0;
});

describe('autorização para entrar no painel', () => {
  it('registra a visita e guarda apenas o hash do token', async () => {
    const grant = await grantImpersonation(ADMIN, 'u-equipe');

    expect(grant.targetName).toBe('João');
    expect(grant.targetRole).toBe('EQUIPE');

    const linha = db.impersonations[0];
    expect(linha).toMatchObject({
      admin_user_id: 'u-admin',
      admin_name: 'Administradora',
      target_user_id: 'u-equipe',
      target_name: 'João',
      target_role: 'EQUIPE',
      client_id: 'cli-1',
    });

    // O token vale uma vez, na resposta. O banco recebe o hash.
    expect(linha.token_hash).toBe(sha256(grant.token));
    expect(linha.token_hash).not.toBe(grant.token);
    expect(Object.values(linha)).not.toContain(grant.token);
  });

  it('o prazo é curto: a autorização serve para abrir a aba, e nada além', async () => {
    const grant = await grantImpersonation(ADMIN, 'u-time');
    const restante = new Date(grant.expiresAt).getTime() - Date.now();

    expect(restante).toBeGreaterThan(0);
    expect(restante).toBeLessThanOrEqual(3 * 60_000);
  });

  it('nenhum ADMIN geral entra no painel de outro ADMIN geral', async () => {
    db.users.push({
      id: 'u-admin-2',
      name: 'Outro ADMIN',
      role: 'ADMIN',
      client_id: null,
      is_active: true,
    });

    await expect(grantImpersonation(ADMIN, 'u-admin-2')).rejects.toThrow();
    expect(db.impersonations).toHaveLength(0);
  });

  it('acesso desligado não abre painel: religar é decisão explícita', async () => {
    await expect(grantImpersonation(ADMIN, 'u-fora')).rejects.toThrow();
    expect(db.impersonations).toHaveLength(0);
  });

  it('quem não é ADMIN geral não emite autorização nenhuma', async () => {
    const time = { id: 'u-time', name: 'Marina', role: 'CANDIDATE' } as const;

    await expect(grantImpersonation(time, 'u-equipe')).rejects.toThrow();
    expect(db.impersonations).toHaveLength(0);
  });
});

describe('a autorização vira sessão', () => {
  it('abre a sessão da pessoa, marcada com quem a abriu', async () => {
    const grant = await grantImpersonation(ADMIN, 'u-equipe');
    const claimed = await claimImpersonation(grant.token);

    expect(claimed?.targetUserId).toBe('u-equipe');

    const sessao = db.sessions[0];
    expect(sessao).toMatchObject({ user_id: 'u-equipe', impersonated_by: 'u-admin' });

    // Nem o token da autorizacao nem o da sessao chegam ao banco em texto
    // puro.
    expect(sessao.token_hash).toBe(sha256(claimed!.sessionToken));
    expect(chamadas[0].args.p_token_hash).toBe(sha256(grant.token));
  });

  it('vale uma vez só: o mesmo endereço aberto de novo não abre nada', async () => {
    const grant = await grantImpersonation(ADMIN, 'u-equipe');

    expect(await claimImpersonation(grant.token)).not.toBeNull();
    expect(await claimImpersonation(grant.token)).toBeNull();
    expect(db.sessions).toHaveLength(1);
  });

  it('endereço inventado não abre sessão', async () => {
    expect(await claimImpersonation('token-que-nunca-existiu')).toBeNull();
    expect(db.sessions).toHaveLength(0);
  });

  it('autorização vencida não abre sessão', async () => {
    const grant = await grantImpersonation(ADMIN, 'u-equipe');
    db.impersonations[0].expires_at = new Date(Date.now() - 1000).toISOString();

    expect(await claimImpersonation(grant.token)).toBeNull();
    expect(db.sessions).toHaveLength(0);
  });

  it('pessoa desativada entre a emissão e o clique não abre sessão', async () => {
    const grant = await grantImpersonation(ADMIN, 'u-equipe');
    db.users = db.users.map((row) => (row.id === 'u-equipe' ? { ...row, is_active: false } : row));

    expect(await claimImpersonation(grant.token)).toBeNull();
    expect(db.sessions).toHaveLength(0);
  });
});

describe('sair da inspeção', () => {
  it('revoga a sessão aberta pelo ADMIN', async () => {
    const grant = await grantImpersonation(ADMIN, 'u-equipe');
    const claimed = await claimImpersonation(grant.token);

    expect(await endImpersonation(claimed!.sessionToken)).toBe(true);
    expect(db.sessions[0].revoked_at).toBeTruthy();
  });

  it('não alcança uma sessão comum: sair de inspeção não desloga ninguém', async () => {
    // A sessao do celular da propria pessoa, sem `impersonated_by`.
    db.sessions.push({
      id: 'ses-pessoa',
      user_id: 'u-equipe',
      token_hash: sha256('token-do-celular-dela'),
      impersonated_by: null,
    });

    expect(await endImpersonation('token-do-celular-dela')).toBe(false);
    expect(db.sessions[0].revoked_at).toBeUndefined();
  });
});
