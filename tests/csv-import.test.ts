import { describe, expect, it } from 'vitest';
import {
  EXEMPLO_CSV,
  MODELO_SEPARADOR,
  MUNICIPIO_PADRAO,
  UF_PADRAO,
  lerPlanilha,
  problemasDaLinha,
  separarEndereco,
} from '@/lib/domain/csv-import';

/**
 * Leitura da planilha de integrantes.
 *
 * O que estes testes protegem: a planilha entra pela MESMA porta da ficha —
 * os valores saem normalizados do mesmo jeito —, e uma linha torta nunca
 * derruba as outras.
 */

const CABECALHO =
  'Nome completo,Telefone,Título de eleitor,Zona eleitoral,Seção eleitoral,Endereço';

describe('leitura da planilha', () => {
  it('lê as cinco colunas, na ordem que vierem', () => {
    const { linhas } = lerPlanilha(
      [
        'Seção eleitoral;Nome completo;Zona eleitoral;Telefone;Título de eleitor',
        '3;Maria da Silva;44;82999990001;100000002720',
      ].join('\n'),
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      name: 'Maria da Silva',
      phone: '82999990001',
      voterId: '100000002720',
      zone: '44',
      section: '3',
    });
  });

  it('o endereço vem em uma coluna só e chega separado em bairro e rua', () => {
    const { linhas } = lerPlanilha(
      [CABECALHO, 'Ana Lima,82999990002,,1,2,"Rua Brasil Novo, Nº 269 – Jardim Brasil"'].join('\n'),
    );

    expect(linhas[0].street).toBe('Rua Brasil Novo, Nº 269');
    expect(linhas[0].district).toBe('Jardim Brasil');
    // O texto original fica guardado, para quem for conferir.
    expect(linhas[0].address).toBe('Rua Brasil Novo, Nº 269 – Jardim Brasil');
  });

  it('normaliza como a ficha normaliza', () => {
    const { linhas } = lerPlanilha(
      [CABECALHO, 'Maria da Silva,(82) 99999-0001,1000 0000 2720,044,0003,'].join('\n'),
    );

    // Telefone sem máscara, título só com dígitos, e o zero à frente fora:
    // "044" é a zona 44, aqui como em todo o resto do sistema.
    expect(linhas[0].phone).toBe('82999990001');
    expect(linhas[0].voterId).toBe('100000002720');
    expect(linhas[0].zone).toBe('44');
    expect(linhas[0].section).toBe('3');
  });

  it('aceita aspas e vírgula dentro do campo', () => {
    const { linhas } = lerPlanilha(
      [CABECALHO, '"Lima, Ana Beatriz",82999990002,,1,2,'].join('\n'),
    );
    expect(linhas[0].name).toBe('Lima, Ana Beatriz');
  });

  it('coluna a mais é ignorada, e a planilha diz quais', () => {
    const { linhas, ignoradas } = lerPlanilha(
      [`${CABECALHO},CPF,Observações`, 'Ana Lima,82999990002,,1,2,,12345678901,anotação'].join(
        '\n',
      ),
    );

    expect(linhas).toHaveLength(1);
    expect(ignoradas).toEqual(['CPF', 'Observações']);
  });

  it('linha vazia é pulada sem alarde', () => {
    const { linhas, vazias } = lerPlanilha(
      [CABECALHO, 'Ana Lima,82999990002,,1,2,', ',,,,,', '', 'Bruno Sá,82988887777,,3,4,'].join(
        '\n',
      ),
    );

    expect(linhas).toHaveLength(2);
    // As duas contam: a de separadores soltos e a linha em branco.
    expect(vazias).toBe(2);
  });

  it('guarda o número da linha da planilha, para quem for corrigir achar', () => {
    const { linhas } = lerPlanilha(
      [CABECALHO, 'Ana Lima,82999990002,,1,2,', 'Bruno Sá,82988887777,,3,4,'].join('\n'),
    );
    expect(linhas.map((linha) => linha.linha)).toEqual([2, 3]);
  });

  it('planilha vazia ou só com cabeçalho não inventa linha', () => {
    expect(lerPlanilha('').linhas).toEqual([]);
    expect(lerPlanilha('   ').linhas).toEqual([]);
    expect(lerPlanilha(CABECALHO).linhas).toEqual([]);
  });

  it('BOM do Excel não quebra a primeira coluna', () => {
    const { linhas } = lerPlanilha(`﻿${CABECALHO}\nAna Lima,82999990002,,1,2,Rua A`);
    expect(linhas[0].name).toBe('Ana Lima');
  });
});

describe('o que impede uma linha de ser cadastrada', () => {
  function linha(extra: Partial<ReturnType<typeof lerPlanilha>['linhas'][0]>) {
    return {
      id: 'x',
      linha: 2,
      name: 'Ana Lima',
      phone: '82999990002',
      voterId: '',
      zone: '',
      section: '',
      district: '',
      street: '',
      address: '',
      ...extra,
    };
  }

  it('nome e telefone são as duas exigências, como na ficha', () => {
    expect(problemasDaLinha(linha({}))).toEqual([]);
    expect(problemasDaLinha(linha({ name: '' }))).toEqual(['nome']);
    expect(problemasDaLinha(linha({ phone: '' }))).toEqual(['telefone']);
    expect(problemasDaLinha(linha({ phone: '123' }))).toEqual(['telefone']);
    expect(problemasDaLinha(linha({ name: 'A', phone: '' }))).toEqual(['nome', 'telefone']);
  });

  it('título, zona e seção podem faltar', () => {
    expect(problemasDaLinha(linha({ voterId: '', zone: '', section: '' }))).toEqual([]);
  });
});

describe('planilha de exemplo', () => {
  it('sai separada por ponto e vírgula: é assim que o Excel abre em colunas', () => {
    // Com vírgula, o Excel em português empilha tudo em uma coluna só, e a
    // planilha chega inútil na mão de quem ia preenchê-la.
    expect(MODELO_SEPARADOR).toBe(';');

    const [cabecalho] = EXEMPLO_CSV.split(/\r?\n/);
    expect(cabecalho.split(';')).toHaveLength(6);
    expect(cabecalho).toBe(
      'Nome completo;Telefone;Título de eleitor;Zona eleitoral;Seção eleitoral;Endereço',
    );
  });

  it('o exemplo que o sistema oferece é lido por ele mesmo', () => {
    const { linhas, ignoradas } = lerPlanilha(EXEMPLO_CSV);

    expect(ignoradas).toEqual([]);
    expect(linhas).toHaveLength(3);
    expect(linhas.every((item) => problemasDaLinha(item).length === 0)).toBe(true);
    expect(linhas[0].voterId).toBe('100000002720');
  });
});

describe('arquivos que o Excel exporta', () => {
  it('a linha "sep=;" é instrução do Excel, não cabeçalho', () => {
    const { linhas, ignoradas } = lerPlanilha(
      ['sep=;', 'Nome completo;Telefone;Zona eleitoral', 'Ana Lima;82999990002;7'].join('\r\n'),
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0].name).toBe('Ana Lima');
    expect(linhas[0].zone).toBe('7');
    expect(ignoradas).toEqual([]);
  });

  it('lê igual com ponto e vírgula, vírgula ou tabulação', () => {
    const porColuna = (texto: string) => lerPlanilha(texto).linhas[0];

    const comPontoEVirgula = porColuna('Nome completo;Telefone\nAna Lima;82999990002');
    const comVirgula = porColuna('Nome completo,Telefone\nAna Lima,82999990002');
    const comTab = porColuna('Nome completo\tTelefone\nAna Lima\t82999990002');

    expect(comPontoEVirgula.name).toBe('Ana Lima');
    expect(comVirgula).toMatchObject({ name: 'Ana Lima', phone: '82999990002' });
    expect(comTab).toMatchObject({ name: 'Ana Lima', phone: '82999990002' });
  });
});

describe('endereço escrito em uma linha só', () => {
  /**
   * Os casos são os da planilha REAL que chegou: é ela que decide se a
   * separação presta, e não um exemplo inventado.
   */
  const casos: [string, string, string][] = [
    // texto da planilha ................................. bairro ............ rua
    ['Rua Brasil Novo, Nº 269 – Jardim Brasil', 'Jardim Brasil', 'Rua Brasil Novo, Nº 269'],
    ['Rua Leonardo Pinto, Nº 201 – Jardim Brasil', 'Jardim Brasil', 'Rua Leonardo Pinto, Nº 201'],
    ['Rua Vila Esperança, Nº 18 – Bairro Vila Maria', 'Vila Maria', 'Rua Vila Esperança, Nº 18'],
    [
      'Rua Getúlio Vargas, Nº 572 – Bairro São Cristóvão',
      'São Cristóvão',
      'Rua Getúlio Vargas, Nº 572',
    ],
    ['Rua Ezequiel Pereira, S/N – Jardim Brasil', 'Jardim Brasil', 'Rua Ezequiel Pereira, S/N'],
    ['Aldeia, Fazenda Canto', 'Aldeia', 'Fazenda Canto'],
    ['Aldeia, Campina de Baixo', 'Aldeia', 'Campina de Baixo'],
    ['Conjunto Brivaldo Medeiros, QJ Nº 11', 'Conjunto Brivaldo Medeiros', 'QJ Nº 11'],
    ['Conjunto Brivaldo Medeiros, QJ Nº 08', 'Conjunto Brivaldo Medeiros', 'QJ Nº 08'],
    [
      'Alto do Cruzeiro, Rua Santa Isabel, Nº 7',
      'Alto do Cruzeiro',
      'Rua Santa Isabel, Nº 7',
    ],
    ['Alto do Cruzeiro, Rua Boa Vista, Nº 94', 'Alto do Cruzeiro', 'Rua Boa Vista, Nº 94'],
  ];

  it.each(casos)('%s', (texto, bairro, rua) => {
    expect(separarEndereco(texto)).toMatchObject({ district: bairro, street: rua });
  });

  it('rua com número não vira bairro pela vírgula do número', () => {
    // "Rua Padre Cícero, Nº 14" é uma rua com número, e não uma rua em um
    // bairro chamado "Nº 14".
    expect(separarEndereco('Rua Padre Cícero, Nº 14')).toMatchObject({
      district: '',
      street: 'Rua Padre Cícero, Nº 14',
    });
    expect(separarEndereco('Rua Boa Vista, Nº 163')).toMatchObject({
      district: '',
      street: 'Rua Boa Vista, Nº 163',
    });
  });

  it('sem certeza, o texto inteiro fica na rua', () => {
    // Melhor um campo com tudo legível do que dois repartidos no palpite
    // errado.
    expect(separarEndereco('Perto da igreja')).toMatchObject({
      district: '',
      street: 'Perto da igreja',
    });
  });

  it('endereço vazio não inventa nada', () => {
    expect(separarEndereco('')).toEqual({ district: '', street: '', address: '' });
  });
});

describe('estado e município', () => {
  it('toda planilha é de Alagoas, de Palmeira dos Índios', () => {
    expect(UF_PADRAO).toBe('AL');
    expect(MUNICIPIO_PADRAO).toBe('Palmeira dos Índios');
  });
});

describe('telefone com dígito a mais', () => {
  it('não é cortado em silêncio: fica marcado para correção', () => {
    // "829999493112" tem doze dígitos. Cortar o último daria um telefone que
    // PARECE certo e liga para outra pessoa — e ninguém descobriria.
    const { linhas } = lerPlanilha(
      [CABECALHO, 'Valéria dos Santos Neves,829999493112,,10,326,'].join('\n'),
    );

    expect(linhas[0].phone).toBe('829999493112');
    expect(problemasDaLinha(linhas[0])).toContain('telefone');
  });

  it('código do país não é dígito a mais', () => {
    // "5582..." é o mesmo número escrito para fora do Brasil.
    const { linhas } = lerPlanilha(
      [CABECALHO, 'Ana Lima,5582999990002,,1,2,'].join('\n'),
    );

    expect(linhas[0].phone).toBe('82999990002');
    expect(problemasDaLinha(linhas[0])).toEqual([]);
  });

  it('telefone de dez e de onze dígitos passa como sempre', () => {
    const { linhas } = lerPlanilha(
      [CABECALHO, 'Ana Lima,8299280204,,1,2,', 'Bruno Sá,82999871807,,1,2,'].join('\n'),
    );

    expect(linhas.map((l) => l.phone)).toEqual(['8299280204', '82999871807']);
    expect(linhas.every((l) => problemasDaLinha(l).length === 0)).toBe(true);
  });
});

describe('título de eleitor torto', () => {
  it('a pessoa entra: o dígito verificador não recusa o cadastro', () => {
    // "018161400850" veio de uma planilha real e não fecha o verificador.
    // Recusar deixaria a pessoa de fora por causa de um número mal copiado.
    const { linhas } = lerPlanilha(
      [CABECALHO, 'Antonio Lucas Bezerra,8299280204,018161400850,10,147,'].join('\n'),
    );

    expect(linhas[0].voterId).toBe('018161400850');
    expect(problemasDaLinha(linhas[0])).toEqual([]);
  });
});
