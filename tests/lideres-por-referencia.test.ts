import { describe, expect, it } from 'vitest';
import type { Member } from '@/lib/types';
import { SEM_REFERENCIA } from '@/lib/domain/filtros-da-equipe';
import {
  agruparPorReferencia,
  lideresComReferencia,
  lideresDasReferencias,
  nomeDoPdfDeLideres,
  referenciasDosLideres,
} from '@/lib/domain/lideres-por-referencia';

let seq = 0;
const pessoa = (dados: Partial<Member>): Member =>
  ({ id: `p${++seq}`, name: 'Fulano', recruitedBy: null, tier: 'LIDER', ...dados }) as Member;

const time = [
  pessoa({ name: 'Zélia Moura', reference: 'Roberval' }),
  pessoa({ name: 'ana beatriz', reference: 'ROBERVAL ' }),
  pessoa({ name: 'Ângela Lima', reference: 'Roberval' }),
  pessoa({ name: 'Bruno Costa', reference: 'Dr. Félix' }),
  pessoa({ name: 'Carlos Dias', reference: null }),
  pessoa({ name: 'Equipe Que Não Entra', reference: 'Roberval', tier: 'EQUIPE' }),
];

describe('líderes por referência', () => {
  it('lista só os Líderes, em ordem alfabética, sem diferenciar acento nem maiúscula', () => {
    expect(lideresComReferencia(time).map((l) => l.nome)).toEqual([
      'ana beatriz',
      'Ângela Lima',
      'Bruno Costa',
      'Carlos Dias',
      'Zélia Moura',
    ]);
  });

  it('usa a forma mais escrita da referência para todos', () => {
    const lideres = lideresComReferencia(time);
    expect(lideres.find((l) => l.nome === 'ana beatriz')?.referencia).toBe('Roberval');
    expect(lideres.find((l) => l.nome === 'Carlos Dias')).toMatchObject({ referencia: null, chave: SEM_REFERENCIA });
  });

  it('oferece as referências em ordem alfabética, com "Sem referência" por último', () => {
    expect(referenciasDosLideres(time).map((o) => [o.rotulo, o.quantidade])).toEqual([
      ['Dr. Félix', 1],
      ['Roberval', 3],
      ['Sem referência', 1],
    ]);
  });

  it('leva só as referências escolhidas', () => {
    const lideres = lideresComReferencia(time);
    const roberval = referenciasDosLideres(time).find((o) => o.rotulo === 'Roberval')!.valor;
    expect(lideresDasReferencias(lideres, new Set([roberval])).map((l) => l.nome)).toEqual([
      'ana beatriz',
      'Ângela Lima',
      'Zélia Moura',
    ]);
  });

  it('agrupa por referência em ordem alfabética', () => {
    const grupos = agruparPorReferencia(lideresComReferencia(time));
    expect(grupos.map((g) => [g.rotulo, g.lideres.length])).toEqual([
      ['Dr. Félix', 1],
      ['Roberval', 3],
      ['Sem referência', 1],
    ]);
  });

  it('dá nome ao arquivo pelas referências', () => {
    expect(nomeDoPdfDeLideres(['Dr. Félix'])).toBe('lideres-por-referencia-dr-felix.pdf');
    expect(nomeDoPdfDeLideres(['Dr. Félix', 'Roberval', 'X'])).toBe('lideres-por-referencia-dr-felix-e-mais-2.pdf');
    expect(nomeDoPdfDeLideres([])).toBe('lideres-por-referencia.pdf');
  });
});
