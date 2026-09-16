import { describe, expect, it } from 'vitest';
import { alignRowKeys } from '@/lib/supabase/rest';

/**
 * Envio em lote com chaves diferentes.
 *
 * O PostgREST recusa o lote INTEIRO quando as linhas nao tem exatamente as
 * mesmas chaves — `PGRST102 All object keys must match` —, e nao diz qual
 * chave, qual linha nem qual tabela. Foi assim que a criacao do Time DEMO
 * quebrou: a linha de moradia levava `location_precision` e a do local de
 * votacao nao.
 *
 * O alinhamento acontece antes do envio, para o erro nao depender da
 * disciplina de quem escreve duas linhas quase iguais.
 */
describe('lote de insert', () => {
  it('completa com null a chave que falta em alguma linha', () => {
    const alinhado = alignRowKeys([
      { a: 1, b: 'x', c: 'STREET' },
      { a: 2, b: 'y' },
    ]);

    expect(alinhado).toEqual([
      { a: 1, b: 'x', c: 'STREET' },
      { a: 2, b: 'y', c: null },
    ]);

    // Todas as linhas saem com o MESMO conjunto de chaves: e isso que o
    // PostgREST exige.
    const chaves = alinhado.map((linha) => Object.keys(linha).sort().join(','));
    expect(new Set(chaves).size).toBe(1);
  });

  it('não toca no lote quando as chaves já são iguais', () => {
    const original = [
      { a: 1, b: null },
      { a: 2, b: 'y' },
    ];

    // Mesma referência: nenhum objeto novo é criado no caminho comum.
    expect(alignRowKeys(original)).toBe(original);
  });

  it('deixa o valor nulo existente como está', () => {
    const alinhado = alignRowKeys([
      { a: 1, b: null },
      { a: 2 },
    ]);

    expect(alinhado).toEqual([
      { a: 1, b: null },
      { a: 2, b: null },
    ]);
  });

  it('não mexe em lote de uma linha só', () => {
    const uma = [{ a: 1 }];
    expect(alignRowKeys(uma)).toBe(uma);
    expect(alignRowKeys([])).toEqual([]);
  });
});
