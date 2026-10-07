import { describe, expect, it } from 'vitest';
import { equipePorReferencia } from '@/lib/domain/equipe-por-referencia';
import { SEM_REFERENCIA } from '@/lib/domain/filtros-da-equipe';
import type { Member } from '@/lib/types';

let seq = 0;
const lider = (name: string, reference: string | null) =>
  ({ id: `l${++seq}`, name, tier: 'LIDER', userId: `u-${name}`, reference, recruitedBy: null, createdAt: '2026-09-01T12:00:00Z' }) as unknown as Member;
const equipe = (name: string, l: Member | { name: string; userId: string | null }, dia = 10) =>
  ({ id: `e${++seq}`, name, tier: 'EQUIPE', userId: null, reference: null, recruitedBy: { userId: l.userId, name: l.name, role: 'EQUIPE', photo: null }, createdAt: `2026-09-${dia}T12:00:00Z` }) as unknown as Member;

const felix = lider('Félix', 'ROBERVAL');
const vivian = lider('Vivian', 'roberval ');
const aline = lider('Aline', null);
const time = [
  felix,
  vivian,
  aline,
  equipe('Ana', felix, 11),
  equipe('Bia', felix, 12),
  equipe('Caio', vivian),
  equipe('Duda', aline),
  // Lider sem usuario: a Equipe acha pelo nome.
  equipe('Edu', { name: 'VIVIAN', userId: null }),
  // Lider que nao esta no time.
  equipe('Fabi', { name: 'Fulano', userId: 'u-x' }),
];

describe('o time agrupado por referência', () => {
  it('cada referência com seus Líderes, e a Equipe herdando a referência do Líder', () => {
    const grupos = equipePorReferencia(time, time);
    expect(grupos.map((g) => [g.rotulo, g.totalDeLideres, g.totalDaEquipe, g.total])).toEqual([
      ['ROBERVAL', 2, 5 - 1, 6],
      ['Sem referência', 1, 2, 3],
    ]);
    const roberval = grupos[0];
    expect(roberval.lideres.map((l) => [l.lider?.name, l.equipe.map((m) => m.name)])).toEqual([
      ['Félix', ['Bia', 'Ana']],
      ['Vivian', ['Caio', 'Edu']],
    ]);
    // "Sem referência" por último; quem não tem Líder no time fica no fim dele.
    expect(grupos[1].chave).toBe(SEM_REFERENCIA);
    expect(grupos[1].lideres.map((l) => l.lider?.name ?? null)).toEqual(['Aline', null]);
  });

  it('respeita o recorte da tela: o Líder fora do recorte ainda agrupa a Equipe dele', () => {
    const recorte = time.filter((m) => m.name === 'Ana' || m.name === 'Duda');
    const grupos = equipePorReferencia(recorte, time);
    expect(grupos.map((g) => [g.rotulo, g.total, g.lideres.map((l) => [l.lider?.name, l.liderNoRecorte, l.equipe.length])])).toEqual([
      ['ROBERVAL', 1, [['Félix', false, 1]]],
      ['Sem referência', 1, [['Aline', false, 1]]],
    ]);
  });
});

describe('a mesma pessoa cadastrada mais de uma vez', () => {
  const pessoa = (
    name: string,
    tier: 'LIDER' | 'EQUIPE',
    extra: Partial<Member> & { lider?: Member } = {},
  ) =>
    ({
      id: `p${++seq}`,
      name,
      tier,
      userId: tier === 'LIDER' ? `u-${name}-${seq}` : null,
      reference: null,
      phone: '',
      voterId: null,
      cpf: null,
      zone: null,
      section: null,
      recruitedBy: extra.lider ? { userId: extra.lider.userId, name: extra.lider.name, role: 'EQUIPE', photo: null } : null,
      createdAt: `2026-09-${String(10 + (seq % 15)).padStart(2, '0')}T12:00:00Z`,
      ...extra,
    }) as unknown as Member;

  it('aparece uma vez só, com quem mais cadastrou; o Líder vence a cópia na Equipe; homônimo fica separado', () => {
    const felix = pessoa('Félix', 'LIDER', { reference: 'FÉLIX', createdAt: '2026-01-01T12:00:00Z' });
    const vivian = pessoa('Vivian Beatriz', 'LIDER', { reference: 'ROBERVAL', createdAt: '2026-01-02T12:00:00Z' });
    // Ana: mesmo título, cadastrada pelos dois. Fica no cadastro mais antigo (Félix).
    const anaF = pessoa('Ana Lima', 'EQUIPE', { lider: felix, voterId: '100000002720', createdAt: '2026-09-01T12:00:00Z' });
    const anaV = pessoa('ANA LIMA', 'EQUIPE', { lider: vivian, voterId: '100000002720', createdAt: '2026-09-05T12:00:00Z' });
    // Vivian também na Equipe do Félix (mesmo nome e telefone): fica como Líder.
    vivian.phone = '82999990001';
    const vivianNaEquipe = pessoa('Vivian Beatriz', 'EQUIPE', { lider: felix, phone: '82999990001' });
    // Homônimo: só o nome igual, sem mais nada. Continua separado.
    const outraAna = pessoa('Ana Lima', 'EQUIPE', { lider: vivian });
    const time = [felix, vivian, anaF, anaV, vivianNaEquipe, outraAna];

    const grupos = equipePorReferencia(time, time);
    const linhaDe = (nome: string) => grupos.flatMap((g) => g.lideres).find((l) => l.lider?.name === nome)!;
    expect(linhaDe('Félix').equipe.map((m) => m.id)).toEqual([anaF.id]);
    expect(linhaDe('Félix').repetidos[anaF.id]).toEqual(['Vivian Beatriz · Líder']);
    expect(linhaDe('Vivian Beatriz').equipe.map((m) => m.id)).toEqual([outraAna.id]);
    expect(linhaDe('Vivian Beatriz').repetidos[vivian.id]).toEqual(['Félix · Líder']);
    // Ninguém aparece duas vezes em lugar nenhum.
    const ids = grupos.flatMap((g) => g.lideres.flatMap((l) => [...(l.lider ? [l.lider.id] : []), ...l.equipe.map((m) => m.id)]));
    expect(new Set(ids).size).toBe(ids.length);
    expect(grupos.reduce((t, g) => t + g.total, 0)).toBe(4);
    expect(grupos.reduce((t, g) => t + g.cadastrosRepetidos, 0)).toBe(2);
  });

  it('se só a cópia passa no filtro, a pessoa entra pelo cadastro que fica', () => {
    const felix = pessoa('Félix', 'LIDER', { reference: 'FÉLIX', createdAt: '2026-01-01T12:00:00Z' });
    const vivian = pessoa('Vivian Beatriz', 'LIDER', { reference: 'ROBERVAL', createdAt: '2026-01-02T12:00:00Z' });
    const anaF = pessoa('Ana Lima', 'EQUIPE', { lider: felix, cpf: '52998224725', createdAt: '2026-09-01T12:00:00Z' });
    const anaV = pessoa('Ana Lima', 'EQUIPE', { lider: vivian, cpf: '52998224725', createdAt: '2026-09-05T12:00:00Z' });
    const time = [felix, vivian, anaF, anaV];
    const grupos = equipePorReferencia([anaV], time);
    expect(grupos.map((g) => [g.rotulo, g.lideres.map((l) => [l.lider?.name, l.equipe.map((m) => m.id)])])).toEqual([
      ['FÉLIX', [['Félix', [anaF.id]]]],
    ]);
  });
});
