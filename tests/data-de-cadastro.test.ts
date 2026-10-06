import { describe, expect, it } from 'vitest';
import { lerPlanilha } from '@/lib/domain/csv-import';
import { dataDeCadastroDaPlanilha } from '@/lib/domain/data-da-planilha';
import { lerAbaDoSheets } from '@/lib/domain/planilha-do-sheets';

const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Maceio' });

describe('DATA DE CADASTRO da planilha', () => {
  it('lê data com vírgula, "às", segundos e dia da semana', () => {
    expect(dataDeCadastroDaPlanilha('01/10/2026, 14:30')).toBe('2026-10-01T17:30:00.000Z');
    expect(dataDeCadastroDaPlanilha('01/10/2026 às 14:30')).toBe('2026-10-01T17:30:00.000Z');
    expect(dataDeCadastroDaPlanilha('01/10/2026 14:30:59')).toBe('2026-10-01T17:30:00.000Z');
    expect(dia(dataDeCadastroDaPlanilha('qua., 01/10/2026'))).toBe('01/10/2026');
  });

  it('lê o mês por extenso', () => {
    expect(dia(dataDeCadastroDaPlanilha('1 de outubro de 2026'))).toBe('01/10/2026');
    expect(dia(dataDeCadastroDaPlanilha('quarta-feira, 1 de outubro de 2026'))).toBe('01/10/2026');
    expect(dia(dataDeCadastroDaPlanilha('01/out/2026'))).toBe('01/10/2026');
    expect(dia(dataDeCadastroDaPlanilha('15-set-26'))).toBe('15/09/2026');
    expect(dataDeCadastroDaPlanilha('1 de março de 2026 às 08:05')).toBe('2026-03-01T11:05:00.000Z');
    expect(dataDeCadastroDaPlanilha('31 de fevereiro de 2026')).toBe('');
    expect(dataDeCadastroDaPlanilha('1 de xyz de 2026')).toBe('');
  });

  it('a importação por arquivo lê a coluna, com qualquer nome conhecido', () => {
    const { linhas, ignoradas } = lerPlanilha(
      ['Nome;Telefone;DATA DE CADASTRO', 'Ana Lima;82999990002;15/09/2026', 'Bia Costa;82999990003;ontem', 'Caio Dias;82999990004;'].join('\r\n'),
    );
    expect(ignoradas).toEqual([]);
    expect(dia(linhas[0].registeredAt!)).toBe('15/09/2026');
    expect(linhas[1]).toMatchObject({ registeredAt: '', registeredAtTexto: 'ontem' });
    expect(linhas[2]).toMatchObject({ registeredAt: '', registeredAtTexto: '' });

    const forms = lerPlanilha(['Carimbo de data/hora;Nome', '01/10/2026 14:30:15;Duda Reis'].join('\r\n'));
    expect(forms.linhas[0].registeredAt).toBe('2026-10-01T17:30:00.000Z');
  });

  it('a planilha do Google aceita os mesmos nomes de coluna', () => {
    const aba = lerAbaDoSheets('Bia', [['NOME', 'Carimbo de data/hora'], ['Caio', '15/09/2026']]);
    expect(dia(aba.pessoas[0].registeredAt)).toBe('15/09/2026');
  });
});
