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

describe('filtro de seção eleitoral da equipe', () => {
  it('"0096" e "96" são a mesma seção; com zona escolhida, só as dela', async () => {
    const { opcoesDeSecao, passaNaSecao } = await import('@/lib/domain/filtros-da-equipe');
    const p = (zone: string | null, section: string | null) => ({ zone, section }) as unknown as import('@/lib/types').Member;
    const lista = [p('10', '96'), p('0010', '0096'), p('10', '97'), p('11', '5'), p(null, '3')];
    expect(opcoesDeSecao(lista, 'todas')).toEqual([
      { valor: '10/96', rotulo: 'Zona 10 · Seção 96', quantidade: 2 },
      { valor: '10/97', rotulo: 'Zona 10 · Seção 97', quantidade: 1 },
      { valor: '11/5', rotulo: 'Zona 11 · Seção 5', quantidade: 1 },
    ]);
    expect(opcoesDeSecao(lista, '11').map((o) => o.rotulo)).toEqual(['Seção 5']);
    expect(passaNaSecao(lista[1], '10/96')).toBe(true);
    expect(passaNaSecao(lista[2], '10/96')).toBe(false);
    expect(passaNaSecao(lista[4], 'todas')).toBe(true);
  });
});
