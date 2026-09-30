import { describe, expect, it } from 'vitest';
import type { Member } from '@/lib/types';
import {
  SEM_REFERENCIA,
  SEM_ZONA,
  contarFotos,
  opcoesDeReferencia,
  opcoesDeZona,
  passaNaFoto,
  passaNaOrigem,
  passaNaReferencia,
  passaNaZona,
  tituloLegivel,
} from '@/lib/domain/filtros-da-equipe';
import { buscarPessoa } from '@/lib/domain/busca-de-pessoas';

/** Filtros da lista da Equipe: referência, verificado por foto, zona e origem. */

let seq = 0;
const pessoa = (dados: Partial<Member>): Member =>
  ({ id: `p${++seq}`, name: 'Fulano', recruitedBy: null, tier: 'EQUIPE', ...dados }) as Member;

const lista = [
  pessoa({ reference: 'ROBERVAL', photoVerified: true, zone: '010', fromSheet: true }),
  pessoa({ reference: 'Roberval ', photoVerified: false, zone: '10', fromSheet: true }),
  pessoa({ reference: 'IGREJA', photoVerified: true, zone: '11' }),
  pessoa({ reference: null, photoVerified: null, zone: null }),
];

describe('referência', () => {
  it('junta a mesma referência escrita de jeitos diferentes, a mais comum primeiro', () => {
    expect(opcoesDeReferencia(lista)).toEqual([
      { valor: 'roberval', rotulo: 'ROBERVAL', quantidade: 2 },
      { valor: 'igreja', rotulo: 'IGREJA', quantidade: 1 },
      { valor: SEM_REFERENCIA, rotulo: 'Sem referência', quantidade: 1 },
    ]);
  });

  it('filtra pela referência e por "sem referência"', () => {
    expect(lista.filter((m) => passaNaReferencia(m, 'roberval'))).toHaveLength(2);
    expect(lista.filter((m) => passaNaReferencia(m, SEM_REFERENCIA))).toHaveLength(1);
    expect(lista.filter((m) => passaNaReferencia(m, 'todas'))).toHaveLength(4);
  });

  it('a busca também acha pela referência', () => {
    expect(buscarPessoa(lista[0], 'roberval')).toEqual({ achou: true, campos: ['referência'] });
  });
});

describe('verificado por foto', () => {
  it('conta e filtra Sim, Não e não informado', () => {
    expect(contarFotos(lista)).toEqual({ sim: 2, nao: 1, sem: 1 });
    expect(lista.filter((m) => passaNaFoto(m, 'sim'))).toHaveLength(2);
    expect(lista.filter((m) => passaNaFoto(m, 'nao'))).toHaveLength(1);
    expect(lista.filter((m) => passaNaFoto(m, 'sem'))).toHaveLength(1);
  });
});

describe('zona e origem', () => {
  it('"010" e "10" são a mesma zona', () => {
    expect(opcoesDeZona(lista)).toEqual([
      { valor: '10', rotulo: 'Zona 10', quantidade: 2 },
      { valor: '11', rotulo: 'Zona 11', quantidade: 1 },
      { valor: SEM_ZONA, rotulo: 'Sem zona', quantidade: 1 },
    ]);
    expect(lista.filter((m) => passaNaZona(m, '10'))).toHaveLength(2);
  });

  it('separa quem veio da planilha de quem está no sistema', () => {
    expect(lista.filter((m) => passaNaOrigem(m, 'planilha'))).toHaveLength(2);
    expect(lista.filter((m) => passaNaOrigem(m, 'sistema'))).toHaveLength(2);
  });
});

describe('título legível', () => {
  it('em grupos de quatro, como no papel', () => {
    expect(tituloLegivel('024059791708')).toBe('0240 5979 1708');
    expect(tituloLegivel(null)).toBeNull();
  });
});
