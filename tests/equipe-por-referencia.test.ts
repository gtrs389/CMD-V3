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
