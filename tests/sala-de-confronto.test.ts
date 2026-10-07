import { describe, expect, it } from 'vitest';
import type { PollingPlacePin } from '@/lib/domain/map-pin';
import type { EscolaNoComparativo } from '@/lib/domain/confronto';
import { montarDuelo, parteDaEsquerda, votosDoComparativo, votosNaEscola } from '@/lib/domain/sala-de-confronto';

const pino = (id: string, secoes: [string | null, string | null, number][]): PollingPlacePin => ({
  locationId: id,
  latitude: -9.41,
  longitude: -36.61,
  title: 'COLÉGIO ESTADUAL HUMBERTO MENDES',
  address: null,
  city: 'Palmeira dos Índios',
  state: 'AL',
  imageUrl: null,
  total: secoes.reduce((t, [, , n]) => t + n, 0),
  men: 0,
  women: 0,
  others: 0,
  sections: secoes.map(([zone, section, total]) => ({ zone, section, total })),
});

// A escola do raio-x: dois candidatos da esquerda (Nivaldo e Paulinho).
const ESCOLA: Pick<EscolaNoComparativo, 'chave' | 'secoes'> = {
  chave: 'tse:h',
  secoes: [
    { zona: '10', secao: '96', estimativa: 12, apurado: [30, 5] },
    { zona: '10', secao: '97', estimativa: 8, apurado: [2, 1] },
    { zona: null, secao: null, estimativa: 3, apurado: [0, 0] },
  ],
};

describe('sala de confronto', () => {
  it('a esquerda sai do comparativo da escola, sem a linha "sem seção"', () => {
    const m = votosDoComparativo(ESCOLA, 1);
    expect([...m.keys()]).toEqual(['10/96', '10/97']);
    expect(m.get('10/96')?.votos).toBe(5);
  });

  it('o adversário entra pela seção ("0097" é a 97) e traz as seções que só ele tem na escola', () => {
    const votacao = [pino('tse:outro-id', [['010', '0097', 20], ['10', '98', 7]]), pino('tse:longe', [['28', '10', 50]])];
    const m = votosNaEscola(ESCOLA, votacao);
    expect(m.get('10/97')).toEqual({ zona: '10', secao: '97', votos: 20 });
    expect(m.get('10/98')?.votos).toBe(7);
    expect(m.has('28/10')).toBe(false);
    // Com a seção do filtro, só as seções que o raio-x mostra.
    expect([...votosNaEscola(ESCOLA, votacao, true).keys()]).toEqual(['10/97']);
  });

  it('cada seção tem um vencedor; o placar conta seções, votos e o que faltou para virar', () => {
    const direita = votosNaEscola(ESCOLA, [pino('tse:h', [['10', '96', 10], ['10', '97', 20], ['10', '98', 7]])]);
    const d = montarDuelo(ESCOLA, [votosDoComparativo(ESCOLA, 0), votosDoComparativo(ESCOLA, 1)], [direita], [
      { porSecao: { '10/97': 4 } },
    ]);
    expect(d.secoes.map((s) => [s.chave, s.vencedor])).toEqual([
      ['10/96', 'ESQUERDA'],
      ['10/97', 'DIREITA'],
      ['10/98', 'DIREITA'],
    ]);
    expect(d.esquerda).toEqual([32, 6]);
    expect(d.direita).toEqual([37]);
    expect(d.totalEsquerda).toBe(38);
    expect(d.vitorias).toEqual({ esquerda: 1, direita: 2, empate: 0 });
    // 97: 3 x 20 (faltam 18); 98: 0 x 7 (faltam 8).
    expect(d.paraVirar).toBe(26);
    expect(d.maisDisputada?.chave).toBe('10/98');
    expect(d.maiorDerrota?.chave).toBe('10/97');
    expect(d.maiorVitoria?.chave).toBe('10/96');
    expect(d.dosLideres).toEqual({ secoes: 1, pessoas: 4, esquerda: 3, direita: 20, vitorias: 0, derrotas: 1 });
    expect(Math.round(parteDaEsquerda(d))).toBe(51);
  });

  it('sem adversário e sem votos, a seção fica sem vencedor e a barra no meio', () => {
    const d = montarDuelo({ secoes: [{ zona: '1', secao: '2', estimativa: 5, apurado: [0] }] }, [votosDoComparativo({ secoes: [{ zona: '1', secao: '2', estimativa: 5, apurado: [0] }] }, 0)], []);
    expect(d.secoes[0].vencedor).toBe('SEM_VOTOS');
    expect(d.dosLideres).toBeNull();
    expect(parteDaEsquerda(d)).toBe(50);
  });
});
