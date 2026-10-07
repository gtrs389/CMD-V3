import { describe, expect, it } from 'vitest';
import { indiceDeLocais, localDaPessoa, numeroEleitoral, ondeAEquipeVota, type LocalDeVotacao } from '@/lib/domain/onde-a-equipe-vota';

const HUMBERTO: LocalDeVotacao = { id: 'h', nome: 'COLÉGIO HUMBERTO MENDES', endereco: null, cidade: 'PALMEIRA DOS ÍNDIOS', zona: 10, secoes: [71, 72] };
const CRISTO: LocalDeVotacao = { id: 'c', nome: 'COLÉGIO CRISTO REDENTOR', endereco: null, cidade: 'PALMEIRA DOS ÍNDIOS', zona: 10, secoes: [80] };
const indice = indiceDeLocais([HUMBERTO, CRISTO]);
const p = (zone: string | null, section: string | null) => ({ zone, section });

describe('onde a Equipe do Líder vota', () => {
  it('acha a escola pela zona e seção, com ou sem zero à esquerda', () => {
    expect(numeroEleitoral('0010')).toBe(10);
    expect(numeroEleitoral('')).toBeNull();
    expect(localDaPessoa(indice, p('0010', '071'))?.nome).toBe('COLÉGIO HUMBERTO MENDES');
    expect(localDaPessoa(indice, p('10', '99'))).toBeNull();
    expect(localDaPessoa(indice, p(null, '71'))).toBeNull();
  });

  it('junta escolas, zonas e seções, e conta quem não dá para localizar', () => {
    const r = ondeAEquipeVota(
      [p('10', '71'), p('10', '71'), p('10', '72'), p('10', '80'), p('10', '99'), p('11', '5'), p(null, null), p('10', '')],
      indice,
    );
    expect(r.escolas.map((e) => [e.local.nome, e.total, e.secoes])).toEqual([
      ['COLÉGIO HUMBERTO MENDES', 3, [{ secao: 71, total: 2 }, { secao: 72, total: 1 }]],
      ['COLÉGIO CRISTO REDENTOR', 1, [{ secao: 80, total: 1 }]],
    ]);
    expect(r.zonas).toEqual([
      { zona: 10, total: 5 },
      { zona: 11, total: 1 },
    ]);
    expect(r.secoes.map((s) => [s.zona, s.secao, s.total, s.local?.id ?? null])).toEqual([
      [10, 71, 2, 'h'],
      [10, 72, 1, 'h'],
      [10, 80, 1, 'c'],
      [10, 99, 1, null],
      [11, 5, 1, null],
    ]);
    expect(r.semZonaSecao).toBe(2);
    expect(r.semLocal).toBe(2);
  });
});
