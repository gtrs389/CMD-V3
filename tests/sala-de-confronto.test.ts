import { describe, expect, it } from 'vitest';
import type { PollingPlacePin } from '@/lib/domain/map-pin';
import type { EscolaNoComparativo } from '@/lib/domain/confronto';
import {
  campanhaDoRecorte,
  escolaDaSala,
  montarDuelo,
  parteDaEsquerda,
  placarDosLideres,
  porZona,
  referenciasDosLideres,
  resumoDoDuelo,
  votosDoComparativo,
  votosNaEscola,
} from '@/lib/domain/sala-de-confronto';

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
    const escola = { secoes: [{ zona: '1', secao: '2', estimativa: 5, apurado: [0] }] };
    const d = montarDuelo(escola, [votosDoComparativo(escola, 0)], []);
    expect(d.secoes[0].vencedor).toBe('SEM_VOTOS');
    expect(d.dosLideres).toBeNull();
    expect(parteDaEsquerda(d)).toBe(50);
  });

  it('zona a zona e líder a líder: o duelo só nas seções de cada um', () => {
    const direita = votosNaEscola(ESCOLA, [pino('tse:h', [['10', '96', 10], ['10', '97', 20], ['11', '5', 4]])]);
    const d = montarDuelo(ESCOLA, [votosDoComparativo(ESCOLA, 0)], [direita]);
    const zonas = porZona(d.secoes);
    expect(zonas.map((z) => [z.zona, z.totalEsquerda, z.totalDireita, z.vitorias.esquerda, z.vitorias.direita])).toEqual([
      ['10', 32, 30, 1, 1],
      ['11', 0, 4, 0, 1],
    ]);
    const lideres = placarDosLideres(d.secoes, [
      { id: 'a', nome: 'Ana', cadastrados: 3, porSecao: { '10/97': 3 } },
      { id: 'f', nome: 'Félix', cadastrados: 10, porSecao: { '10/96': 6, '10/97': 2, '-/-': 2 } },
    ]);
    expect(lideres.map((l) => l.lider.nome)).toEqual(['Félix', 'Ana']);
    expect(lideres[0]).toMatchObject({ pessoas: 8, esquerda: 32, direita: 30, vitorias: 1, derrotas: 1, conversao: 400 });
    expect(placarDosLideres(d.secoes, [{ id: 'f', nome: 'Félix', cadastrados: 8, porSecao: { '10/96': 6, '10/97': 2 } }], 2)[0].conversao).toBe(200);
    expect(lideres[0].secoes.map((x) => x.secao.chave)).toEqual(['10/96', '10/97']);
    expect(lideres[1]).toMatchObject({ pessoas: 3, esquerda: 2, direita: 20, vitorias: 0, derrotas: 1 });
    expect(resumoDoDuelo(d, { estimativa: 23 }, 2)).toMatchObject({ estimativa: 23, secoes: 3, zonas: ['10', '11'], esquerda: 32, direita: 34 });
  });

  it('a escola enviada é achada de novo, com o recorte do envio (só a gente do Líder)', () => {
    const campanha: PollingPlacePin = {
      ...pino('c-humberto', [['10', '96', 5], ['10', '97', 3]]),
      leaders: [
        { id: 'f', name: 'Félix', total: 5, men: 0, women: 0, others: 0, sections: [{ zone: '10', section: '96', total: 5 }] },
        { id: 'a', name: 'Ana', total: 3, men: 0, women: 0, others: 0, sections: [{ zone: '10', section: '97', total: 3 }] },
      ],
    };
    const payload = { pins: [], pollingPlaces: [campanha] };
    const doFelix = campanhaDoRecorte(payload, { leader: 'f' });
    expect(doFelix[0].total).toBe(5);
    // O primeiro candidato não tem voto ali; o segundo tem: a escola sai casada com o TSE.
    const escola = escolaDaSala(doFelix, [[], [pino('tse:h', [['10', '96', 9]])]], { chave: 'tse:h', pinos: ['c-humberto'] });
    expect(escola?.chave).toBe('tse:h');
    expect(escola?.estimativa).toBe(5);
    expect(escolaDaSala(doFelix, [[]], { chave: 'tse:h', pinos: ['c-humberto'] })?.chave).toBe('campanha:c-humberto');
    expect(escolaDaSala(doFelix, [[]], { chave: 'x', pinos: ['outro'] })).toBeNull();
  });

  it('as referências dos líderes da escola: "Roberval" e "ROBERVAL " são uma só; sem referência por último', () => {
    const r = referenciasDosLideres([
      { referencia: 'Roberval', cadastrados: 2 },
      { referencia: 'ROBERVAL ', cadastrados: 3 },
      { referencia: null, cadastrados: 9 },
      { referencia: 'Hugo', cadastrados: 1 },
    ]);
    expect(r.map((o) => [o.rotulo, o.lideres, o.pessoas])).toEqual([
      ['Roberval', 2, 5],
      ['Hugo', 1, 1],
      [null, 1, 9],
    ]);
  });
});
