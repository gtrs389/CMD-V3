import { beforeEach, describe, expect, it, vi } from 'vitest';

const escritas: { tabela: string; linhas: Record<string, unknown>[]; chave: string }[] = [];
const linhas: Record<string, Record<string, unknown>[]> = {};

vi.mock('@/lib/supabase/rest', () => ({
  upsertRows: vi.fn(async (tabela: string, valores: Record<string, unknown>[], chave: string) => {
    escritas.push({ tabela, linhas: valores, chave });
  }),
  selectRows: vi.fn(async (tabela: string) => linhas[tabela] ?? []),
  selectOne: vi.fn(async (tabela: string, opcoes: { filters: { id: string } }) =>
    (linhas[tabela] ?? []).find((l) => `eq.${l.id}` === opcoes.filters.id) ?? null,
  ),
}));

const { gravarCandidatos, gravarSecoes, votacaoNoMapa } = await import('@/lib/server/votacao.service');

beforeEach(() => {
  escritas.length = 0;
  linhas.cmd_polling_places = [
    { id: 'pp-h', uf: 'AL', zone: 10, name: 'COLÉGIO ESTADUAL HUMBERTO MENDES', address: 'AV GOV MUNIZ FALCÃO', city: 'Palmeira dos Índios', sections: [96, 97], latitude: -9.4, longitude: -36.6 },
  ];
  linhas.cmd_election_sections = [
    { zone: 28, section: 10, city: 'IGACI', place_number: 1040, place_name: 'ESCOLA DO SÍTIO', place_address: null },
  ];
  linhas.cmd_election_votes = [
    { id: 'v1', year: 2026, round: 1, uf: 'AL', office_code: 7, office: 'Deputado Estadual', number: '15123', name: 'FULANO', kind: 'CANDIDATO', total_votes: 23, sections: [[10, 96, 12], [10, 97, 8], [28, 10, 3]] },
  ];
});

describe('votação do TSE no servidor', () => {
  it('grava pela chave natural: enviar de novo atualiza, não duplica', async () => {
    await gravarSecoes([{ ano: 2026, uf: 'AL', zona: 10, secao: 96, municipioCodigo: 28150, municipio: 'PALMEIRA DOS ÍNDIOS', localNumero: 1015, localNome: 'HUMBERTO', localEndereco: null }]);
    await gravarCandidatos([{ ano: 2026, turno: 1, uf: 'AL', cargoCodigo: 7, cargo: 'Deputado Estadual', numero: '15123', nome: 'FULANO', tipo: 'CANDIDATO', total: 20, secoes: [[10, 96, 20]] }]);

    expect(escritas.map((e) => [e.tabela, e.chave])).toEqual([
      ['cmd_election_sections', 'year,uf,zone,section'],
      ['cmd_election_votes', 'year,round,uf,office_code,number'],
    ]);
    expect(escritas[1].linhas[0]).toMatchObject({ office_code: 7, number: '15123', total_votes: 20, sections: [[10, 96, 20]] });
  });

  it('devolve o candidato escola por escola; a escola sem ponto fica fora do mapa, mas na conta', async () => {
    const r = await votacaoNoMapa('v1');
    expect(r.candidato).toMatchObject({ nome: 'FULANO', numero: '15123', total: 23 });
    expect(r.noMapa).toHaveLength(1);
    expect(r.noMapa[0]).toMatchObject({ title: 'COLÉGIO ESTADUAL HUMBERTO MENDES', total: 20, latitude: -9.4 });
    expect(r.foraDoMapa.map((p) => [p.title, p.total])).toEqual([['ESCOLA DO SÍTIO', 3]]);
  });

  it('candidato que não existe é 404', async () => {
    await expect(votacaoNoMapa('nao-existe')).rejects.toMatchObject({ status: 404 });
  });
});
