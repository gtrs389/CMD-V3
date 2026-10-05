import { describe, expect, it } from 'vitest';
import type { PollingPlacePin } from '@/lib/domain/map-pin';
import { confrontar, conversao, leitura, pinosDoConfronto, recortar } from '@/lib/domain/confronto';

const pino = (id: string, titulo: string, secoes: [string | null, string | null, number][], ponto: [number, number] = [-9.4, -36.6]): PollingPlacePin => ({
  locationId: id,
  latitude: ponto[0],
  longitude: ponto[1],
  title: titulo,
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

// Campanha: o que o time esperava. A secao vem do cadastro, com zero a esquerda.
const CAMPANHA = [
  pino('c-humberto', 'COLÉGIO ESTADUAL HUMBERTO MENDES', [['010', '0096', 12], ['10', '97', 8], [null, null, 3]], [-9.41, -36.61]),
  pino('c-cristo', 'COLÉGIO CRISTO REDENTOR', [['10', '66', 9]], [-9.42, -36.62]),
  // Sem secao no cadastro: so o lugar e o nome resolvem.
  pino('c-cesmac', 'Faculdade Cesmac do Sertão', [[null, null, 5]], [-9.4301, -36.6301]),
];
// Votacao: o que o candidato teve (TSE).
const VOTACAO = [
  pino('tse:h', 'COLÉGIO ESTADUAL HUMBERTO MENDES', [['10', '96', 30], ['10', '97', 2], ['10', '98', 7]], [-9.41, -36.61]),
  pino('tse:f', 'FACULDADE CESMAC DO SERTAO', [['10', '200', 4]], [-9.43, -36.63]),
  pino('tse:x', 'ESCOLA SEM TIME', [['28', '10', 50]], [-9.5, -36.5]),
];

describe('estimativa x apuração', () => {
  const r = confrontar(CAMPANHA, VOTACAO);
  const escola = (t: string) => r.escolas.find((e) => e.titulo.toUpperCase().includes(t))!;

  it('a seção liga a escola da campanha à da apuração; "0096" e "96" são a mesma seção', () => {
    const h = escola('HUMBERTO');
    expect(h).toMatchObject({ chave: 'tse:h', estimativa: 23, apurado: 39, pinosDaCampanha: ['c-humberto'] });
    expect(h.secoes).toEqual([
      { zona: '10', secao: '96', estimativa: 12, apurado: 30 },
      { zona: '10', secao: '97', estimativa: 8, apurado: 2 },
      { zona: '10', secao: '98', estimativa: 0, apurado: 7 },
      { zona: null, secao: null, estimativa: 3, apurado: 0 },
    ]);
  });

  it('sem seção no cadastro, vale o mesmo ponto e o mesmo nome (acento e caixa não atrapalham)', () => {
    expect(escola('CESMAC')).toMatchObject({ chave: 'tse:f', estimativa: 5, apurado: 4 });
  });

  it('escola com estimativa e zero voto entra, com ponto no mapa', () => {
    expect(escola('CRISTO')).toMatchObject({ chave: 'campanha:c-cristo', estimativa: 9, apurado: 0, noMapa: true });
    expect(leitura(escola('CRISTO'))).toBe('ZERADA');
  });

  it('os totais separam o que é da base do time do resto', () => {
    expect(r.doTime.map((e) => e.chave)).toEqual(['tse:h', 'campanha:c-cristo', 'tse:f']);
    expect(r.estimativaTotal).toBe(37);
    expect(r.apuradoNasEscolasDoTime).toBe(43);
    expect(r.apuradoTotal).toBe(93);
    expect(escola('SEM TIME')).toMatchObject({ estimativa: 0, apurado: 50 });
  });

  it('a leitura: acima, perto, abaixo, zerada, sem estimativa', () => {
    expect(leitura({ estimativa: 10, apurado: 12 })).toBe('ACIMA');
    expect(leitura({ estimativa: 10, apurado: 8 })).toBe('PERTO');
    expect(leitura({ estimativa: 10, apurado: 3 })).toBe('ABAIXO');
    expect(leitura({ estimativa: 10, apurado: 0 })).toBe('ZERADA');
    expect(leitura({ estimativa: 0, apurado: 9 })).toBe('SEM_ESTIMATIVA');
    expect(conversao({ estimativa: 20, apurado: 30 })).toBe(150);
    expect(conversao({ estimativa: 0, apurado: 30 })).toBeNull();
  });
});

describe('o confronto no mapa e no recorte', () => {
  const r = confrontar(CAMPANHA, VOTACAO);

  it('vira pinos: o número é o apurado; a escola do time com zero voto aparece com zero', () => {
    const { noMapa, foraDoMapa } = pinosDoConfronto(r);
    expect(foraDoMapa).toEqual([]);
    expect(noMapa.find((p) => p.locationId === 'campanha:c-cristo')).toMatchObject({ total: 0, sections: [] });
    expect(noMapa.find((p) => p.locationId === 'tse:h')?.sections).toEqual([
      { zone: '10', section: '96', total: 30 },
      { zone: '10', section: '97', total: 2 },
      { zone: '10', section: '98', total: 7 },
    ]);
  });

  it('o recorte refaz as contas só com as escolas escolhidas', () => {
    const so = recortar(r, new Set(['tse:h', 'tse:x']));
    expect(so).toMatchObject({ estimativaTotal: 23, apuradoNasEscolasDoTime: 39, apuradoTotal: 89 });
    expect(so.doTime.map((e) => e.chave)).toEqual(['tse:h']);
  });
});
