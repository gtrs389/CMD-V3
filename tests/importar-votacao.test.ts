import { deflateRawSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const enviados: { tipo: string; linhas: unknown[] }[] = [];
vi.mock('@/lib/repositories/http/api', () => ({
  api: vi.fn(async (_path: string, opcoes: { body: { tipo: string; linhas: unknown[] } }) => {
    enviados.push(opcoes.body);
    return { gravadas: opcoes.body.linhas.length };
  }),
}));

const { importarVotacao } = await import('@/components/dashboard/votacao/importar-votacao');
const { entradasDoZip, ehZip } = await import('@/lib/utils/zip');

/** Um .zip de verdade, montado em memoria, com os arquivos dados. */
function zip(arquivos: { nome: string; dados: Buffer }[]): Buffer {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let deslocamento = 0;
  for (const { nome, dados } of arquivos) {
    const compactado = deflateRawSync(dados);
    const nomeB = Buffer.from(nome);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compactado.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nomeB.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compactado.length, 20);
    central.writeUInt32LE(dados.length, 24);
    central.writeUInt16LE(nomeB.length, 28);
    central.writeUInt32LE(deslocamento, 42);
    locais.push(local, nomeB, compactado);
    centrais.push(central, nomeB);
    deslocamento += 30 + nomeB.length + compactado.length;
  }
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...locais, diretorio, fim]);
}

const CSV = [
  '"ANO_ELEICAO";"NR_TURNO";"SG_UF";"CD_MUNICIPIO";"NM_MUNICIPIO";"NR_ZONA";"NR_SECAO";"CD_CARGO";"DS_CARGO";"NR_VOTAVEL";"NM_VOTAVEL";"QT_VOTOS";"NR_LOCAL_VOTACAO";"NM_LOCAL_VOTACAO"',
  '"2026";"1";"AL";"28150";"PALMEIRA DOS ÍNDIOS";"10";"96";"7";"DEPUTADO ESTADUAL";"15123";"JOSÉ DA CONCEIÇÃO";"12";"1015";"COLÉGIO ESTADUAL HUMBERTO MENDES"',
  '"2026";"1";"AL";"28150";"PALMEIRA DOS ÍNDIOS";"10";"97";"7";"DEPUTADO ESTADUAL";"15123";"JOSÉ DA CONCEIÇÃO";"8";"1015";"COLÉGIO ESTADUAL HUMBERTO MENDES"',
  '"2026";"1";"AL";"28150";"PALMEIRA DOS ÍNDIOS";"10";"97";"3";"GOVERNADOR";"13";"FULANA";"40";"1015";"COLÉGIO ESTADUAL HUMBERTO MENDES"',
].join('\r\n');

beforeEach(() => {
  enviados.length = 0;
});

describe('envio da votação do TSE', () => {
  it('abre o .zip do TSE (latin1), lê a planilha e envia seções e candidatos em lotes', async () => {
    const conteudo = zip([
      { nome: 'leiame.pdf', dados: Buffer.from('%PDF') },
      { nome: 'votacao_secao_2026_AL.csv', dados: Buffer.from(CSV, 'latin1') },
    ]);
    const arquivo = new File([new Uint8Array(conteudo)], 'votacao_secao_2026_AL.zip');

    expect(await ehZip(arquivo)).toBe(true);
    expect((await entradasDoZip(arquivo)).map((e) => e.nome)).toEqual(['leiame.pdf', 'votacao_secao_2026_AL.csv']);

    const andamento: string[] = [];
    const resumo = await importarVotacao(arquivo, (a) => andamento.push(a.fase));

    expect(resumo).toMatchObject({ linhas: 3, ignoradas: 0, secoes: 2, candidatos: 2 });
    expect(resumo.cargos.sort()).toEqual(['Deputado Estadual · 1º turno', 'Governador · 1º turno']);
    expect(andamento).toContain('gravando');

    const secoes = enviados.filter((l) => l.tipo === 'secoes').flatMap((l) => l.linhas);
    expect(secoes).toContainEqual(expect.objectContaining({ zona: 10, secao: 96, municipio: 'PALMEIRA DOS ÍNDIOS' }));
    const candidatos = enviados.filter((l) => l.tipo === 'candidatos').flatMap((l) => l.linhas);
    expect(candidatos).toContainEqual(
      expect.objectContaining({ nome: 'JOSÉ DA CONCEIÇÃO', total: 20, secoes: [[10, 96, 12], [10, 97, 8]] }),
    );
  });

  it('aceita o .csv solto, e recusa arquivo que não é a planilha de votação', async () => {
    await importarVotacao(new File([new Uint8Array(Buffer.from(CSV, 'latin1'))], 'votacao.csv'), () => {});
    expect(enviados.length).toBeGreaterThan(0);

    await expect(importarVotacao(new File(['NOME;TELEFONE\nAna;1'], 'x.csv'), () => {})).rejects.toThrow(
      /não é a planilha de votação/,
    );
  });
});
