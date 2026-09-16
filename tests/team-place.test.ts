import { describe, expect, it } from 'vitest';
import { clientCreateSchema, clientUpdateSchema } from '@/lib/validation/server.schema';

/**
 * Estado e municipios do time (migration 038).
 *
 * O estado e obrigatorio no time NOVO, e pela SIGLA: e assim que o endereco
 * do integrante ja e gravado, e cruzar as duas coisas e a razao de o campo
 * existir. Os municipios sao opcionais e varios — uma operacao raramente
 * cabe em um municipio so.
 */

const base = {
  name: 'Time Montenegro',
  people: [{ name: 'Joana Alves', phone: '82999999999', photo: null }],
};

describe('estado do time', () => {
  it('cadastro novo exige o estado', () => {
    expect(() => clientCreateSchema.parse(base)).toThrow();
  });

  it('aceita a sigla e normaliza para maiuscula', () => {
    expect(clientCreateSchema.parse({ ...base, stateUf: 'al' }).stateUf).toBe('AL');
    expect(clientCreateSchema.parse({ ...base, stateUf: ' sp ' }).stateUf).toBe('SP');
  });

  it('recusa o que nao e sigla', () => {
    // Um estado por extenso nunca cruzaria com o endereco do integrante.
    for (const invalido of ['Alagoas', 'XX', '', 'A', 'BRASIL']) {
      expect(() => clientCreateSchema.parse({ ...base, stateUf: invalido })).toThrow();
    }
  });

  it('a EDICAO nao exige estado', () => {
    // Os times criados antes da 038 nao tem estado. Exigir aqui trancaria a
    // propria tela que os conserta.
    expect(() => clientUpdateSchema.parse({ name: 'Outro nome' })).not.toThrow();
    expect('stateUf' in clientUpdateSchema.parse({ name: 'Outro nome' })).toBe(false);
  });
});

describe('municipios do time', () => {
  it('sao opcionais: sem eles o time vale o estado inteiro', () => {
    expect(clientCreateSchema.parse({ ...base, stateUf: 'AL' }).cities).toEqual([]);
  });

  it('aceita varios', () => {
    const saida = clientCreateSchema.parse({
      ...base,
      stateUf: 'AL',
      cities: ['Maceió', 'Arapiraca', 'Penedo'],
    });
    expect(saida.cities).toEqual(['Maceió', 'Arapiraca', 'Penedo']);
  });

  it('o mesmo municipio duas vezes na tela nao vira dois no banco', () => {
    const saida = clientCreateSchema.parse({
      ...base,
      stateUf: 'AL',
      cities: ['Maceió', 'Maceió', 'Penedo'],
    });
    expect(saida.cities).toEqual(['Maceió', 'Penedo']);
  });

  it('a EDICAO sem municipios NAO apaga os do time', () => {
    // `.partial()` nao tira o `.default([])` herdado: sem esta guarda, salvar
    // so o nome zeraria a lista de municipios sem ninguem pedir — o mesmo
    // defeito que apagava a foto do time.
    const saida = clientUpdateSchema.parse({ name: 'Outro nome' });
    expect('cities' in saida).toBe(false);
  });

  it('a EDICAO que MANDA a lista vazia apaga, porque foi pedido', () => {
    const saida = clientUpdateSchema.parse({ cities: [] });
    expect(saida.cities).toEqual([]);
  });
});
