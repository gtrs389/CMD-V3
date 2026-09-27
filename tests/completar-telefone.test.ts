import { beforeEach, describe, expect, it, vi } from 'vitest';
import { completarTelefone } from '@/lib/domain/completar-telefone';

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

/* ---- a rota: recalcula no servidor, corrige a ficha, e o acesso so quando o numero e livre ---- */

type Ficha = { id: string; clientId: string; phone: string; recruitedBy: null };
let fichas: Ficha[] = [];
const gravados: { id: string; phone: string }[] = [];
const acessos: string[] = [];
const ocupados = new Set<string>();

vi.mock('@/lib/server/guard', () => ({
  requireClientAccess: async () => ({ id: 'adm', role: 'ADMIN', candidateId: null }),
}));
vi.mock('@/lib/server/member.service', () => ({
  listMembersByClient: async () => fichas,
  updateMember: async (id: string, input: { phone: string }) => {
    gravados.push({ id, phone: input.phone });
    return {};
  },
}));
vi.mock('@/lib/server/user.service', () => ({
  assertTeamPhoneAvailable: async (_c: string, phone: string) => {
    if (ocupados.has(phone)) throw new Error('ocupado');
  },
  syncMemberAccess: async (id: string) => {
    acessos.push(id);
  },
}));

const { POST } = await import('@/app/api/clients/[id]/telefones/route');

async function chamar(memberIds: string[]) {
  const request = new Request('http://x/api/clients/c1/telefones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberIds }),
  });
  const resposta = await POST(request as never, { params: Promise.resolve({ id: 'c1' }) } as never);
  return resposta.json();
}

beforeEach(() => {
  fichas = [
    { id: 'a', clientId: 'c1', phone: '99247526', recruitedBy: null },
    { id: 'b', clientId: 'c1', phone: '8299247526', recruitedBy: null },
    { id: 'c', clientId: 'c1', phone: '82999990000', recruitedBy: null },
    { id: 'd', clientId: 'c1', phone: '988887777', recruitedBy: null },
  ];
  gravados.length = 0;
  acessos.length = 0;
  ocupados.clear();
});

describe('rota de completar telefones', () => {
  it('corrige só as fichas pedidas que se encaixam, com o número recalculado no servidor', async () => {
    const r = await chamar(['a', 'b', 'c', 'x']);
    expect([...gravados].sort((x, y) => x.id.localeCompare(y.id))).toEqual([
      { id: 'a', phone: '82999247526' },
      { id: 'b', phone: '82999247526' },
    ]);
    expect(acessos).toEqual(['a']);
    // "c" ja estava certo; "x" nao e deste time.
    expect(r).toEqual({ corrigidos: 2, semMexerNoAcesso: 1, pulados: 2 });
  });

  it('duas fichas que viram o mesmo número: só a primeira fica com o acesso', async () => {
    // "a" (99247526) e "b" (8299247526) viram 82999247526.
    const r = await chamar(['a', 'b']);
    expect(gravados.map((g) => g.id).sort()).toEqual(['a', 'b']);
    expect(acessos).toEqual(['a']);
    expect(r).toEqual({ corrigidos: 2, semMexerNoAcesso: 1, pulados: 0 });
  });

  it('número que já é o acesso de outra pessoa: corrige a ficha, não mexe no acesso', async () => {
    ocupados.add('82988887777');
    const r = await chamar(['d']);
    expect(gravados).toEqual([{ id: 'd', phone: '82988887777' }]);
    expect(acessos).toEqual([]);
    expect(r).toEqual({ corrigidos: 1, semMexerNoAcesso: 1, pulados: 0 });
  });
});
