import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { ApiCaller } from '@/lib/server/api-guard';

/**
 * A API gera o link COMO SE o dono da chave tivesse clicado no painel — e so
 * alcanca o que e dele.
 *
 * Duas regras vivem aqui:
 *
 *   1. no painel, quando o Administrador do time clica em "Gerar link", a
 *      rota chama `issuePersonalInvite(user.id, user.id)` — dono e gerador
 *      sao a mesma pessoa, e e isso que o rastreamento mostra. A API precisa
 *      chamar o banco exatamente do mesmo jeito;
 *   2. a identidade vem do VINCULO DA CHAVE, nunca da requisicao. Uma chave
 *      do Joao nao gera, nao lista, nao consulta e nao revoga nada da Maria.
 *
 * O teste olha o que chega na funcao do banco e nos filtros das consultas,
 * que e onde as duas decisoes se materializam.
 */

const TIME = { id: 'time-1', name: 'Time Bezerra', recruiting_active: true };

const JOAO = { id: 'user-joao', name: 'João Silva' };

/** Convite como o banco o devolve depois da geracao. */
const CONVITE = {
  id: 'invite-1',
  client_id: TIME.id,
  user_id: JOAO.id,
  token: 'token-opaco-do-link',
  active: true,
  issued_at: '2026-09-14T10:00:00.000Z',
  expires_at: '2026-09-15T10:00:00.000Z',
  status: 'ACTIVE',
  claimed_at: null,
  consumed_at: null,
  revoked_at: null,
  generation: 4,
  owner_name: JOAO.name,
  owner_role: 'CANDIDATE',
  // O banco grava o gerador recebido em `p_generated_by`.
  generated_by_name: JOAO.name,
  generated_by_role: 'CANDIDATE',
};

const chamadas: { nome: string; args: Record<string, unknown> }[] = [];
const consultas: { tabela: string; filtros: Record<string, string> }[] = [];

vi.mock('@/lib/server/public-origin', () => ({
  publicLink: async (_request: unknown, path: string) => `https://www.exemplo.test${path}`,
}));

vi.mock('@/lib/supabase/rest', () => ({
  selectOne: async (table: string, options: { filters?: Record<string, string> }) => {
    consultas.push({ tabela: table, filtros: options.filters ?? {} });
    if (table === 'cmd_clients') return { ...TIME };
    if (table === 'cmd_invites') {
      // O recorte por dono e aplicado na consulta: sem ele, nada volta.
      const dono = (options.filters?.user_id ?? '').replace('eq.', '');
      return dono === JOAO.id ? { ...CONVITE } : null;
    }
    return null;
  },
  selectRows: async (table: string, options: { filters?: Record<string, string> }) => {
    consultas.push({ tabela: table, filtros: options.filters ?? {} });
    if (table === 'cmd_invites') {
      const dono = (options.filters?.user_id ?? '').replace('eq.', '');
      return dono === JOAO.id ? [{ ...CONVITE }] : [];
    }
    return [];
  },
  insertRows: async (_table: string, values: Record<string, unknown>[]) =>
    values.map((_, index) => ({ id: `ev-${index}` })),
  insertOne: async () => ({ ...CONVITE }),
  updateRows: async () => [],
  inFilter: (values: readonly string[]) => `in.(${values.join(',')})`,
  callFunction: async (nome: string, args: Record<string, unknown>) => {
    chamadas.push({ nome, args });
    if (nome === 'cmd_invite_issue') {
      return [
        { invite_id: CONVITE.id, issued_at: CONVITE.issued_at, expires_at: CONVITE.expires_at },
      ];
    }
    return null;
  },
}));

const { generateApiLink, getApiLink, listApiLinks } = await import(
  '@/lib/server/api-link.service'
);
const { requireEmptyBody } = await import('@/lib/server/api-guard');

/** Chave vinculada ao João, do Time Bezerra. */
const CHAVE: ApiCaller = {
  keyId: 'chave-1',
  keyName: 'Integração CRM',
  adminUserId: 'user-admin',
  adminName: 'Administradora',
  owner: {
    userId: JOAO.id,
    userName: JOAO.name,
    clientId: TIME.id,
    clientName: TIME.name,
  },
};

/** A API so le cabeçalhos e a URL da requisicao; nada mais e usado aqui. */
const REQUISICAO = {} as NextRequest;

beforeEach(() => {
  chamadas.length = 0;
  consultas.length = 0;
});

describe('link gerado pela API', () => {
  it('chama o banco como o painel chama: o dono é também o gerador', async () => {
    await generateApiLink(REQUISICAO, CHAVE);

    const emissao = chamadas.find((chamada) => chamada.nome === 'cmd_invite_issue');
    expect(emissao, 'a emissão do link não chegou ao banco').toBeDefined();

    // O coração da regra: quem gerou é o próprio dono da chave, e não o ADMIN
    // geral que a criou. É isso que faz o rastreamento sair idêntico ao de um
    // clique do João no painel.
    expect(emissao?.args.p_user_id).toBe(JOAO.id);
    expect(emissao?.args.p_generated_by).toBe(JOAO.id);
    expect(emissao?.args.p_generated_by).not.toBe(CHAVE.adminUserId);
  });

  it('devolve o link com o dono do time nos dois papéis', async () => {
    const link = await generateApiLink(REQUISICAO, CHAVE);

    expect(link.dono).toEqual({ id: JOAO.id, nome: JOAO.name, perfil: 'CANDIDATE' });
    expect(link.geradoPor).toEqual({ nome: JOAO.name, perfil: 'CANDIDATE' });
    expect(link.url).toBe(`https://www.exemplo.test/convite/${CONVITE.token}`);
    expect(link.time).toEqual({ id: TIME.id, nome: TIME.name });
  });

  it('usa o time do vínculo, e não algum identificador da requisição', async () => {
    await generateApiLink(REQUISICAO, CHAVE);

    const time = consultas.find((consulta) => consulta.tabela === 'cmd_clients');
    expect(time?.filtros.id).toBe(`eq.${TIME.id}`);
  });
});

describe('escopo da chave', () => {
  it('lista apenas os links do administrador vinculado', async () => {
    await listApiLinks(REQUISICAO, CHAVE);

    const consulta = consultas.find((item) => item.tabela === 'cmd_invites');
    expect(consulta?.filtros.user_id).toBe(`eq.${JOAO.id}`);
  });

  it('não encontra o link de outro administrador', async () => {
    const chaveDaMaria: ApiCaller = {
      ...CHAVE,
      keyId: 'chave-2',
      owner: { ...CHAVE.owner, userId: 'user-maria', userName: 'Maria' },
    };

    // O filtro por dono entra na consulta: para esta chave, o link do João
    // simplesmente não existe — 404, e não 403.
    await expect(getApiLink(REQUISICAO, chaveDaMaria, CONVITE.id)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('corpo da requisição', () => {
  /** Requisicao com o corpo que o teste quiser, sem subir servidor nenhum. */
  function corpo(texto: string): NextRequest {
    return { text: async () => texto } as unknown as NextRequest;
  }

  it('aceita requisição sem corpo, com corpo vazio ou com objeto vazio', async () => {
    await expect(requireEmptyBody(corpo(''))).resolves.toBeUndefined();
    await expect(requireEmptyBody(corpo('   '))).resolves.toBeUndefined();
    await expect(requireEmptyBody(corpo('{}'))).resolves.toBeUndefined();
  });

  it('recusa donoId e timeId: a identidade vem da chave', async () => {
    await expect(corpoRecusado('{"donoId":"user-maria"}')).resolves.toBe(400);
    await expect(corpoRecusado('{"timeId":"time-2"}')).resolves.toBe(400);
    await expect(corpoRecusado('{"qualquerCoisa":1}')).resolves.toBe(400);
  });

  async function corpoRecusado(texto: string): Promise<number> {
    try {
      await requireEmptyBody(corpo(texto));
      return 200;
    } catch (error) {
      return (error as { status?: number }).status ?? 500;
    }
  }
});
