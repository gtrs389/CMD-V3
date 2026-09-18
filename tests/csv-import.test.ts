import { describe, expect, it } from 'vitest';
import {
  EXEMPLO_CSV,
  MODELO_SEPARADOR,
  lerPlanilha,
  problemasDaLinha,
} from '@/lib/domain/csv-import';

/**
 * Leitura da planilha de integrantes.
 *
 * O que estes testes protegem: a planilha entra pela MESMA porta da ficha —
 * os valores saem normalizados do mesmo jeito —, e uma linha torta nunca
 * derruba as outras.
 */

const CABECALHO = 'Nome completo,Telefone,Título de eleitor,Zona eleitoral,Seção eleitoral';

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

  it('o endereço NÃO vem da planilha: ele é escolhido na conferência', () => {
    // Endereço é a cadeia Estado -> Município -> Bairro -> Rua, e cada passo
    // só existe dentro do anterior. Um texto solto não se encaixa nela.
    const { linhas, ignoradas } = lerPlanilha(
      [`${CABECALHO},Endereço`, 'Ana Lima,82999990002,,1,2,Rua das Flores 100'].join('\n'),
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).not.toHaveProperty('address');
    expect(ignoradas).toEqual(['Endereço']);
  });

  it('normaliza como a ficha normaliza', () => {
    const { linhas } = lerPlanilha(
      [CABECALHO, 'Maria da Silva,(82) 99999-0001,1000 0000 2720,044,0003'].join('\n'),
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
      [CABECALHO, '"Lima, Ana Beatriz",82999990002,,1,2'].join('\n'),
    );
    expect(linhas[0].name).toBe('Lima, Ana Beatriz');
  });

  it('coluna a mais é ignorada, e a planilha diz quais', () => {
    const { linhas, ignoradas } = lerPlanilha(
      [`${CABECALHO},CPF,Observações`, 'Ana Lima,82999990002,,1,2,12345678901,anotação'].join('\n'),
    );

    expect(linhas).toHaveLength(1);
    expect(ignoradas).toEqual(['CPF', 'Observações']);
  });

  it('linha vazia é pulada sem alarde', () => {
    const { linhas, vazias } = lerPlanilha(
      [CABECALHO, 'Ana Lima,82999990002,,1,2', ',,,,', '', 'Bruno Sá,82988887777,,3,4'].join('\n'),
    );

    expect(linhas).toHaveLength(2);
    // As duas contam: a de separadores soltos e a linha em branco.
    expect(vazias).toBe(2);
  });

  it('guarda o número da linha da planilha, para quem for corrigir achar', () => {
    const { linhas } = lerPlanilha(
      [CABECALHO, 'Ana Lima,82999990002,,1,2', 'Bruno Sá,82988887777,,3,4'].join('\n'),
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
    expect(cabecalho.split(';')).toHaveLength(5);
    expect(cabecalho).toBe(
      'Nome completo;Telefone;Título de eleitor;Zona eleitoral;Seção eleitoral',
    );
  });

  it('o exemplo que o sistema oferece é lido por ele mesmo', () => {
    const { linhas, ignoradas } = lerPlanilha(EXEMPLO_CSV);

    expect(ignoradas).toEqual([]);
    expect(linhas).toHaveLength(2);
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
