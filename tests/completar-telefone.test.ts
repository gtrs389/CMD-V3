import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '@/lib/types';
import { completarTelefone, formasDoTelefone, telefoneParaGravar } from '@/lib/domain/completar-telefone';

/**
 * Telefone sem DDD ou sem o 9 do celular: completa com DDD 82 — e so nos
 * casos em que da para ter certeza.
 */

describe('completar telefone', () => {
  it('sem DDD: coloca o 82', () => {
    expect(completarTelefone('99924-7526')).toEqual({ novo: '82999247526', motivo: 'sem-ddd' });
    expect(completarTelefone('3421-1234')).toEqual({ novo: '8234211234', motivo: 'sem-ddd' });
  });

  it('sem DDD e sem o 9: coloca o 82 e o 9', () => {
    expect(completarTelefone('9924-7526')).toEqual({ novo: '82999247526', motivo: 'sem-ddd-e-sem-nove' });
    expect(completarTelefone('8867 1234')).toEqual({ novo: '82988671234', motivo: 'sem-ddd-e-sem-nove' });
  });

  it('com DDD, mas sem o 9: coloca o 9 depois do DDD', () => {
    expect(completarTelefone('(82) 9924-7526')).toEqual({ novo: '82999247526', motivo: 'sem-nove' });
    // O DDD que ja esta no numero e respeitado.
    expect(completarTelefone('(81) 9867-2444')).toEqual({ novo: '81998672444', motivo: 'sem-nove' });
    expect(completarTelefone('082 9924-7526')).toEqual({ novo: '82999247526', motivo: 'sem-nove' });
  });

  it('não mexe no que já está certo, nem no que não dá para adivinhar', () => {
    expect(completarTelefone('(82) 99924-7526')).toBeNull(); // celular completo
    expect(completarTelefone('(82) 3421-1234')).toBeNull(); // fixo com DDD
    expect(completarTelefone('9924752')).toBeNull(); // 7 digitos
    expect(completarTelefone('829992475261')).toBeNull(); // digito a mais
    expect(completarTelefone('123456789')).toBeNull(); // 9 digitos sem o 9 na frente
    expect(completarTelefone('')).toBeNull();
    expect(completarTelefone(null)).toBeNull();
  });
});

describe('gravar e entrar', () => {
  it('todo cadastro e edição gravam o número completo', () => {
    expect(telefoneParaGravar('9924-7526')).toBe('82999247526');
    expect(telefoneParaGravar('(82) 9924-7526')).toBe('82999247526');
    expect(telefoneParaGravar('(82) 99924-7526')).toBe('82999247526');
    // O que nao da para completar vai como veio, so os digitos.
    expect(telefoneParaGravar('9924-752')).toBe('9924752');
  });

  it('o login aceita o número do jeito antigo e do jeito novo', () => {
    expect(formasDoTelefone('(82) 99924-7526').sort()).toEqual(['8299247526', '82999247526']);
    expect(formasDoTelefone('9924-7526').sort()).toEqual(['8299247526', '82999247526']);
    expect(formasDoTelefone('(82) 3421-1234')).toEqual(['8234211234']);
    expect(formasDoTelefone('123')).toEqual([]);
  });
});

/* ---- a correcao automatica: toda lista que sai do servidor ja vem completa ---- */

type Usuario = { id: string; member_id: string; phone: string | null; is_active: boolean };
let usuarios: Usuario[] = [];
const membrosGravados: { id: string; phone: string }[] = [];
const usuariosGravados: { id: string; phone: string }[] = [];
const ocupados = new Set<string>();

vi.mock('@/lib/supabase/rest', () => ({
  selectOne: async (_t: string, o: { filters: Record<string, string> }) =>
    usuarios.find((u) => `eq.${u.member_id}` === o.filters.member_id) ?? null,
  updateRows: async (tabela: string, f: Record<string, string>, valor: { phone: string }) => {
    const id = f.id.replace('eq.', '');
    (tabela === 'cmd_members' ? membrosGravados : usuariosGravados).push({ id, phone: valor.phone });
    return [];
  },
}));
vi.mock('@/lib/server/user.service', () => ({
  assertTeamPhoneAvailable: async (_c: string, phone: string) => {
    if (ocupados.has(phone)) throw new Error('ocupado');
  },
}));

const { completarTelefonesPendentes } = await import('@/lib/server/telefone.service');

const ficha = (id: string, phone: string) => ({ id, clientId: 'c1', phone }) as unknown as Member;

beforeEach(() => {
  usuarios = [];
  membrosGravados.length = 0;
  usuariosGravados.length = 0;
  ocupados.clear();
});

describe('correção automática', () => {
  it('lista sem nada a corrigir: não grava nada', async () => {
    const lista = [ficha('a', '82999247526')];
    expect(await completarTelefonesPendentes(lista)).toBe(lista);
    expect(membrosGravados).toEqual([]);
  });

  it('corrige, grava e devolve a lista já completa', async () => {
    const lista = await completarTelefonesPendentes([ficha('a', '99247526'), ficha('b', '82988887777'), ficha('c', '8198672444')]);
    expect(lista.map((m) => m.phone)).toEqual(['82999247526', '82988887777', '81998672444']);
    expect([...membrosGravados].sort((x, y) => x.id.localeCompare(y.id))).toEqual([
      { id: 'a', phone: '82999247526' },
      { id: 'c', phone: '81998672444' },
    ]);
  });

  it('o acesso acompanha o número — sem derrubar ninguém', async () => {
    usuarios = [{ id: 'u-a', member_id: 'a', phone: '8299247526', is_active: true }];
    await completarTelefonesPendentes([ficha('a', '8299247526')]);
    expect(usuariosGravados).toEqual([{ id: 'u-a', phone: '82999247526' }]);
  });

  it('número completo que já é o acesso de outra pessoa: a ficha corrige, o acesso fica', async () => {
    usuarios = [{ id: 'u-a', member_id: 'a', phone: '8299247526', is_active: true }];
    ocupados.add('82999247526');
    await completarTelefonesPendentes([ficha('a', '8299247526')]);
    expect(membrosGravados).toEqual([{ id: 'a', phone: '82999247526' }]);
    expect(usuariosGravados).toEqual([]);
  });

  it('duas fichas que viram o mesmo número: só a primeira leva o acesso', async () => {
    usuarios = [
      { id: 'u-a', member_id: 'a', phone: '8299247526', is_active: true },
      { id: 'u-b', member_id: 'b', phone: '8299247526', is_active: true },
    ];
    await completarTelefonesPendentes([ficha('a', '8299247526'), ficha('b', '99247526')]);
    expect(membrosGravados).toHaveLength(2);
    expect(usuariosGravados).toEqual([{ id: 'u-a', phone: '82999247526' }]);
  });
});
