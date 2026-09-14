import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { ApiCaller } from '@/lib/server/api-guard';

/**
 * A API gera o link COMO SE o dono tivesse clicado no painel.
 *
 * Esta e a regra central da API de links: no painel, quando o Administrador
 * do time clica em "Gerar link", a rota chama
 * `issuePersonalInvite(user.id, user.id)` — dono e gerador sao a mesma
 * pessoa, e e isso que o rastreamento mostra. A API precisa chamar o banco
 * exatamente do mesmo jeito, senao o historico do time passa a depender do
 * caminho tecnico usado.
 *
 * O teste olha o que chega na funcao do banco (`cmd_invite_issue`), que e
 * onde a decisao se materializa.
 */

const TIME = { id: 'time-1', name: 'Equipe Zona Norte', recruiting_active: true };

const JOAO = {
  id: 'user-joao',
  name: 'João Silva',
  role: 'CANDIDATE',
  client_id: TIME.id,
  is_active: true,
};

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
const registros: Record<string, unknown>[] = [];
const estado = { outroDono: false };

vi.mock('@/lib/server/public-origin', () => ({
  publicLink: async (_request: unknown, path: string) => `https://www.exemplo.test${path}`,
}));

vi.mock('@/lib/supabase/rest', () => ({
  selectOne: async (table: string) => {
    if (table === 'cmd_clients') return { ...TIME };
    if (table === 'cmd_users') {
      // Dono de OUTRO time: usado para provar que o vinculo vem do banco.
      return estado.outroDono ? { ...JOAO, client_id: 'outro-time' } : { ...JOAO };
    }
    if (table === 'cmd_invites') return { ...CONVITE };
    return null;
  },
  selectRows: async () => [],
  insertRows: async (_table: string, values: Record<string, unknown>[]) => {
    registros.push(...values);
    return values.map((_, index) => ({ id: `ev-${index}` }));
  },
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

const { generateApiLink } = await import('@/lib/server/api-link.service');

const CHAMADOR: ApiCaller = {
  userId: 'user-admin',
  userName: 'Administradora',
  via: 'chave',
  keyId: 'chave-1',
  keyName: 'Integração WhatsApp',
};

/** A API so le cabeçalhos e a URL da requisicao; nada mais e usado aqui. */
const REQUISICAO = {} as NextRequest;

beforeEach(() => {
  chamadas.length = 0;
  registros.length = 0;
  estado.outroDono = false;
});

describe('link gerado pela API', () => {
  it('chama o banco como o painel chama: o dono é também o gerador', async () => {
    await generateApiLink(REQUISICAO, { clientId: TIME.id }, CHAMADOR);

    const emissao = chamadas.find((chamada) => chamada.nome === 'cmd_invite_issue');
    expect(emissao, 'a emissão do link não chegou ao banco').toBeDefined();

    // O coração da regra: quem gerou é o próprio dono, e não o ADMIN que
    // chamou a API. É isso que faz o rastreamento sair idêntico ao de um
    // clique do João no painel.
    expect(emissao?.args.p_user_id).toBe(JOAO.id);
    expect(emissao?.args.p_generated_by).toBe(JOAO.id);
    expect(emissao?.args.p_generated_by).not.toBe(CHAMADOR.userId);
  });

  it('devolve o link com o dono do time nos dois papéis', async () => {
    const link = await generateApiLink(REQUISICAO, { clientId: TIME.id }, CHAMADOR);

    expect(link.dono).toEqual({ id: JOAO.id, nome: JOAO.name, perfil: 'CANDIDATE' });
    expect(link.geradoPor).toEqual({ nome: JOAO.name, perfil: 'CANDIDATE' });
    expect(link.url).toBe(`https://www.exemplo.test/convite/${CONVITE.token}`);
    expect(link.time).toEqual({ id: TIME.id, nome: TIME.name });
  });

  it('registra a ação da chave, que é onde o rastro da API fica', async () => {
    await generateApiLink(REQUISICAO, { clientId: TIME.id }, CHAMADOR);

    // O histórico do link não diz que veio da API — de propósito. Sem este
    // registro, a origem da ação se perderia por completo.
    const registro = registros.at(-1);
    expect(registro).toMatchObject({
      api_key_id: CHAMADOR.keyId,
      key_name: CHAMADOR.keyName,
      admin_user_id: CHAMADOR.userId,
      action: 'LINK_GERADO',
      invite_id: CONVITE.id,
      client_id: TIME.id,
      owner_user_id: JOAO.id,
      owner_name: JOAO.name,
    });
  });

  it('recusa gerar em nome de um dono de outro time', async () => {
    estado.outroDono = true;

    await expect(
      generateApiLink(REQUISICAO, { clientId: TIME.id, ownerId: JOAO.id }, CHAMADOR),
    ).rejects.toMatchObject({ status: 400 });

    // Nada chegou ao banco: o vínculo é conferido antes de emitir.
    expect(chamadas.some((chamada) => chamada.nome === 'cmd_invite_issue')).toBe(false);
  });
});
