import { describe, expect, it } from 'vitest';
import {
  AcumuladorDeVotacao,
  PlanilhaInvalida,
  camposDaLinha,
  cargosDaVotacao,
  escolasDoCandidato,
  filtrarCandidatos,
  indiceDeColunas,
  rotuloDoCandidato,
  separadorDe,
  tipoDoVoto,
  type LocalDoTse,
} from '@/lib/domain/votacao-tse';

/** O cabecalho da "votacao por secao" do TSE, como vem no arquivo. */
const CABECALHO =
  '"DT_GERACAO";"HH_GERACAO";"ANO_ELEICAO";"CD_TIPO_ELEICAO";"NM_TIPO_ELEICAO";"NR_TURNO";"CD_ELEICAO";"DS_ELEICAO";"DT_ELEICAO";"TP_ABRANGENCIA";"SG_UF";"SG_UE";"NM_UE";"CD_MUNICIPIO";"NM_MUNICIPIO";"NR_ZONA";"NR_SECAO";"CD_CARGO";"DS_CARGO";"NR_VOTAVEL";"NM_VOTAVEL";"QT_VOTOS";"NR_LOCAL_VOTACAO";"SQ_CANDIDATO";"NM_LOCAL_VOTACAO";"DS_LOCAL_VOTACAO_ENDERECO"';

const linha = (zona: number, secao: number, cargo: [number, string], numero: string, nome: string, votos: number, local: [number, string]) =>
  `"05/10/2026";"03:00:00";"2026";"2";"Eleição Ordinária";"1";"620";"Eleições Gerais Estaduais 2026";"04/10/2026";"E";"AL";"AL";"Alagoas";"28150";"PALMEIRA DOS ÍNDIOS";"${zona}";"${secao}";"${cargo[0]}";"${cargo[1]}";"${numero}";"${nome}";"${votos}";"${local[0]}";"-1";"${local[1]}";"AV GOV MUNIZ FALCÃO, 701"`;

const DEP_EST: [number, string] = [7, 'DEPUTADO ESTADUAL'];
const HUMBERTO: [number, string] = [1015, 'COLÉGIO ESTADUAL HUMBERTO MENDES'];
const CRISTO: [number, string] = [1020, 'COLÉGIO CRISTO REDENTOR'];

function ler(linhas: string[]) {
  const sep = separadorDe(CABECALHO);
  const acumulador = new AcumuladorDeVotacao(indiceDeColunas(camposDaLinha(CABECALHO, sep)));
  for (const l of linhas) acumulador.adicionar(camposDaLinha(l, sep));
  return { acumulador, ...acumulador.resultado() };
}

describe('leitura da planilha do TSE', () => {
  it('acha as colunas pelo nome e recusa planilha que não é a de votação', () => {
    expect(separadorDe(CABECALHO)).toBe(';');
    expect(() => indiceDeColunas(['NOME', 'TELEFONE'])).toThrow(PlanilhaInvalida);
    // O boletim de urna chama o cargo de outro jeito: tambem serve.
    const bweb = CABECALHO.replace('"CD_CARGO"', '"CD_CARGO_PERGUNTA"').replace('"DS_CARGO"', '"DS_CARGO_PERGUNTA"');
    expect(() => indiceDeColunas(camposDaLinha(bweb))).not.toThrow();
  });

  it('respeita aspas: ponto e vírgula dentro do campo não quebra a linha', () => {
    expect(camposDaLinha('"a;b";"c ""d"""')).toEqual(['a;b', 'c "d"']);
  });

  it('soma cada candidato seção a seção e guarda o local de cada seção', () => {
    const { secoes, candidatos, acumulador } = ler([
      linha(10, 96, DEP_EST, '15123', 'FULANO DE TAL', 12, HUMBERTO),
      linha(10, 97, DEP_EST, '15123', 'FULANO DE TAL', 8, HUMBERTO),
      linha(10, 66, DEP_EST, '15123', 'FULANO DE TAL', 5, CRISTO),
      linha(10, 96, DEP_EST, '15', 'MDB', 3, HUMBERTO),
      linha(10, 96, DEP_EST, '95', 'Branco', 2, HUMBERTO),
      linha(10, 96, DEP_EST, '96', 'Nulo', 1, HUMBERTO),
    ]);

    expect(acumulador.linhas).toBe(6);
    expect(secoes).toHaveLength(3);
    expect(secoes.find((s) => s.secao === 96)).toMatchObject({
      ano: 2026,
      uf: 'AL',
      zona: 10,
      municipioCodigo: 28150,
      localNumero: 1015,
      localNome: 'COLÉGIO ESTADUAL HUMBERTO MENDES',
    });

    const fulano = candidatos.find((c) => c.numero === '15123')!;
    expect(fulano).toMatchObject({ turno: 1, cargo: 'Deputado Estadual', tipo: 'CANDIDATO', total: 25 });
    expect(fulano.secoes).toEqual([[10, 66, 5], [10, 96, 12], [10, 97, 8]]);
    expect(candidatos.map((c) => c.tipo).sort()).toEqual(['BRANCO', 'CANDIDATO', 'LEGENDA', 'NULO']);
  });

  it('linha torta é ignorada e contada, sem derrubar a leitura', () => {
    const { acumulador, candidatos } = ler(['"x";"y"', linha(10, 96, DEP_EST, '15123', 'FULANO', 4, HUMBERTO)]);
    expect(acumulador.ignoradas).toBe(1);
    expect(candidatos[0].total).toBe(4);
  });

  it('dois dígitos só é legenda nos cargos proporcionais', () => {
    expect(tipoDoVoto('13', 1)).toBe('CANDIDATO');
    expect(tipoDoVoto('13', 6)).toBe('LEGENDA');
    expect(tipoDoVoto('13123', 6)).toBe('CANDIDATO');
    expect(tipoDoVoto('22', 3, 'Nominal')).toBe('CANDIDATO');
  });

  it('o rótulo diz quem, o cargo e o turno', () => {
    expect(rotuloDoCandidato({ nome: 'FULANO', numero: '15123', cargo: 'Deputado Estadual', turno: 1, tipo: 'CANDIDATO' })).toBe(
      'FULANO (15123) · Deputado Estadual · 1º turno',
    );
  });
});

describe('as escolas de um candidato', () => {
  const local = (id: string, nome: string, zone: number, sections: number[], ponto = true): LocalDoTse => ({
    id,
    name: nome,
    address: null,
    city: 'Palmeira dos Índios',
    uf: 'AL',
    zone,
    sections,
    latitude: ponto ? -9.4 : null,
    longitude: ponto ? -36.6 : null,
  });

  it('cada seção cai na escola onde funciona; a escola soma as seções', () => {
    const { noMapa, foraDoMapa } = escolasDoCandidato(
      [[10, 96, 12], [10, 97, 8], [10, 66, 5]],
      'AL',
      [local('h', 'COLÉGIO ESTADUAL HUMBERTO MENDES', 10, [96, 97, 98]), local('c', 'COLÉGIO CRISTO REDENTOR', 10, [66])],
      [],
    );
    expect(foraDoMapa).toEqual([]);
    expect(noMapa.map((p) => [p.title, p.total])).toEqual([
      ['COLÉGIO ESTADUAL HUMBERTO MENDES', 20],
      ['COLÉGIO CRISTO REDENTOR', 5],
    ]);
    expect(noMapa[0]).toMatchObject({ locationId: 'tse:h', state: 'AL', men: 0, women: 0, others: 20 });
    expect(noMapa[0].sections).toEqual([
      { zone: '10', section: '96', total: 12 },
      { zone: '10', section: '97', total: 8 },
    ]);
  });

  it('escola sem coordenada, ou fora da tabela de locais, entra na conta mas não vira pino', () => {
    const { noMapa, foraDoMapa } = escolasDoCandidato(
      [[10, 96, 12], [28, 10, 3]],
      'AL',
      [local('h', 'HUMBERTO MENDES', 10, [96], false)],
      [{ zone: 28, section: 10, city: 'IGACI', place_number: 1040, place_name: 'ESCOLA DO SÍTIO', place_address: null }],
    );
    expect(noMapa).toEqual([]);
    expect(foraDoMapa.map((p) => [p.title, p.total, p.city])).toEqual([
      ['HUMBERTO MENDES', 12, 'Palmeira dos Índios'],
      ['ESCOLA DO SÍTIO', 3, 'IGACI'],
    ]);
  });
});

describe('o seletor de candidato', () => {
  const c = (id: string, nome: string, numero: string, cargoCodigo: number, cargo: string, total: number, turno = 1, tipo: 'CANDIDATO' | 'LEGENDA' = 'CANDIDATO') =>
    ({ id, ano: 2026, turno, uf: 'AL', cargoCodigo, cargo, numero, nome, tipo, total });
  const LISTA = [
    c('1', 'JOSÉ DA CONCEIÇÃO', '15123', 7, 'Deputado Estadual', 300),
    c('2', 'MARIA LIMA', '13456', 7, 'Deputado Estadual', 900),
    c('3', 'FULANA', '13', 3, 'Governador', 5000),
    c('4', 'FULANA', '13', 3, 'Governador', 6000, 2),
    c('5', 'MDB', '15', 7, 'Deputado Estadual', 50, 1, 'LEGENDA'),
  ];

  it('busca por nome sem acento ou pelo número, do mais votado para o menos', () => {
    expect(filtrarCandidatos(LISTA, { turno: 1, cargoCodigo: null, busca: 'jose' }).map((x) => x.id)).toEqual(['1']);
    expect(filtrarCandidatos(LISTA, { turno: 1, cargoCodigo: 7, busca: '' }).map((x) => x.id)).toEqual(['2', '1']);
    expect(filtrarCandidatos(LISTA, { turno: null, cargoCodigo: null, busca: '13' }).map((x) => x.id)).toEqual(['4', '3', '2']);
  });

  it('legenda só aparece quando pedida', () => {
    expect(filtrarCandidatos(LISTA, { turno: 1, cargoCodigo: 7, busca: '', todos: true }).map((x) => x.id)).toEqual(['2', '1', '5']);
  });

  it('os cargos saem dos dados, na ordem do TSE', () => {
    expect(cargosDaVotacao(LISTA)).toEqual([
      { codigo: 3, nome: 'Governador' },
      { codigo: 7, nome: 'Deputado Estadual' },
    ]);
  });
});
