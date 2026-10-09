import { describe, expect, it } from 'vitest';
import type { PollingPlacePin } from '@/lib/domain/map-pin';
import {
  escolasDoMunicipio,
  municipioParaComparar,
  padraoDoMunicipio,
  relatorioDeZeradas,
  type SecoesDoMunicipioPayload,
} from '@/lib/domain/secoes-zeradas';

const secao = (zone: number, section: number, place: number, nome: string) => ({
  zone,
  section,
  city: 'PALMEIRA DOS ÍNDIOS',
  place_number: place,
  place_name: nome,
  place_address: null,
});

describe('secoes zeradas', () => {
  it('o municipio casa sem acento nem caixa, e o padrao do banco troca o acento por "_"', () => {
    expect(municipioParaComparar('Palmeira dos  Índios ')).toBe(municipioParaComparar('PALMEIRA DOS INDIOS'));
    expect(padraoDoMunicipio('Palmeira dos Índios')).toBe('Palmeira dos _ndios');
    expect(padraoDoMunicipio('São Luís, (MA)*')).toBe('S_o Lu_s_ _MA__');
  });

  it('todas as secoes do municipio entram, com o zero de quem nao teve voto', () => {
    const escolas = escolasDoMunicipio(
      [secao(10, 97, 1, 'HUMBERTO MENDES'), secao(10, 96, 1, 'HUMBERTO MENDES'), secao(10, 40, 2, 'ESCOLA B'), secao(10, 96, 1, 'HUMBERTO MENDES')],
      'AL',
      [{ id: 'h', name: 'COLÉGIO HUMBERTO MENDES', address: 'Rua A', city: 'Palmeira dos Índios', uf: 'AL', zone: 10, sections: [96, 97], latitude: null, longitude: null }],
      [
        [[10, 96, 12]],
        [[10, 97, 3], [10, 40, 0]],
      ],
    );
    expect(escolas.map((e) => [e.chave, e.titulo])).toEqual([
      ['tse:h', 'COLÉGIO HUMBERTO MENDES'],
      ['tse:AL/10/2', 'ESCOLA B'],
    ]);
    // A secao repetida entra uma vez; a ordem e por numero.
    expect(escolas[0].secoes).toEqual([
      { zona: '10', secao: '96', votos: [12, 0] },
      { zona: '10', secao: '97', votos: [0, 3] },
    ]);
    expect(escolas[1].secoes[0].votos).toEqual([0, 0]);
  });

  it('a secao zerada traz a gente do time e cada lider; a escola soma tambem quem nao tem secao', () => {
    const payload: SecoesDoMunicipioPayload = {
      candidatos: ['a', 'b'],
      municipios: [
        {
          municipio: 'Palmeira dos Índios',
          escolas: [
            {
              chave: 'tse:h',
              titulo: 'HUMBERTO MENDES',
              endereco: null,
              cidade: 'PALMEIRA DOS ÍNDIOS',
              secoes: [
                { zona: '10', secao: '96', votos: [12, 0] },
                { zona: '10', secao: '97', votos: [0, 0] },
                { zona: '10', secao: '98', votos: [0, 0] },
              ],
            },
            { chave: 'tse:b', titulo: 'ESCOLA B', endereco: null, cidade: null, secoes: [{ zona: '10', secao: '40', votos: [5, 2] }] },
          ],
        },
      ],
    };
    const campanha: Pick<PollingPlacePin, 'total' | 'sections' | 'leaders'>[] = [
      {
        total: 14,
        sections: [
          { zone: '010', section: '0097', total: 9 },
          { zone: '10', section: '96', total: 3 },
          { zone: null, section: null, total: 2 },
        ],
        leaders: [
          { id: 'f', name: 'Félix', total: 10, men: 0, women: 0, others: 0, sections: [{ zone: '10', section: '97', total: 7 }, { zone: '10', section: '96', total: 3 }] },
          { id: 'a', name: 'Ana', total: 4, men: 0, women: 0, others: 0, sections: [{ zone: '10', section: '97', total: 2 }, { zone: null, section: null, total: 2 }] },
        ],
      },
      // Um pino de outra escola: nao entra.
      { total: 5, sections: [{ zone: '10', section: '40', total: 5 }], leaders: [] },
    ];

    const r = relatorioDeZeradas(payload, campanha, { f: 'Roberval' });
    expect(r.escolas.map((e) => e.titulo)).toEqual(['HUMBERTO MENDES']);
    const h = r.escolas[0];
    // Qualquer um com 0: a 96 entra (o segundo zerou), e cada seção diz quem zerou.
    expect(h.zeradas.map((s) => [s.secao, s.gente, s.zeraram])).toEqual([
      ['96', 3, [1]],
      ['97', 9, [0, 1]],
      ['98', 0, [0, 1]],
    ]);
    expect(h.zeradas[1].lideres).toEqual([
      { id: 'f', nome: 'Félix', pessoas: 7, referencia: 'Roberval' },
      { id: 'a', nome: 'Ana', pessoas: 2, referencia: null },
    ]);
    expect(h.genteNaEscola).toBe(14);
    expect(h.lideres.map((l) => [l.nome, l.pessoas, l.nasZeradas])).toEqual([
      ['Félix', 10, 10],
      ['Ana', 4, 2],
    ]);
    expect(h.votosNaEscola).toEqual([12, 0]);
    expect(h.escala).toBe(12);
    expect(r.totais).toMatchObject({
      escolasDoMunicipio: 2,
      secoesDoMunicipio: 4,
      secoesZeradas: 3,
      zeradasComGente: 2,
      genteNasZeradas: 12,
      zeradasPorCandidato: [2, 3],
    });
    expect(r.alarmes.map((s) => [s.escola, s.secao])).toEqual([
      ['HUMBERTO MENDES', '97'],
      ['HUMBERTO MENDES', '96'],
    ]);
    expect(r.lideres.map((l) => [l.nome, l.nasZeradas, l.secoes, l.escolas])).toEqual([
      ['Félix', 10, 2, 1],
      ['Ana', 2, 1, 1],
    ]);
  });
});
