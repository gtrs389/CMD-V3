import { describe, expect, it, vi } from 'vitest';
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

/**
 * Consulta por lista longa.
 *
 * O filtro `in.(...)` viaja na URL. Mil identificadores sao cerca de 37 KB de
 * endereco, e o servidor recusa a consulta INTEIRA — foi assim que a pagina de
 * um Time DEMO de mil pessoas ficou zerada com as pessoas gravadas no banco e
 * aparecendo no mapa, que le por outro caminho.
 *
 * O fatiamento vive dentro de `selectRows`: o limite e da URL, nao de quem
 * consulta, e escrito em um lugar so ele nao tem como ser esquecido na
 * proxima consulta que um dia receber mil identificadores.
 */
describe('consulta por lista longa', () => {
  it('parte a lista em lotes e devolve tudo junto', async () => {
    // Identificadores de verdade: o banco recusa uuid mal formado, e foi
    // exatamente uma aspa a mais que quebrou a primeira versao disto.
    const ids = Array.from(
      { length: 1000 },
      (_, index) => `141976cc-7e6d-4fc4-8cc1-${String(index).padStart(12, '0')}`,
    );
    const urls: string[] = [];

    process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
    process.env.SUPABASE_SECRET_KEY = `sb_secret_${'x'.repeat(32)}`;

    const { selectRows, IN_FILTER_CHUNK } = await import('@/lib/supabase/rest');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      urls.push(url);
      const filtro = new URL(url).searchParams.get('id') ?? '';
      // `inFilter` envolve cada valor em aspas: e assim que o PostgREST
      // aceita identificador com virgula dentro.
      const linhas = filtro
        .slice(4, -1)
        .split(',')
        .map((id) => ({ id: id.replace(/^"|"$/g, '') }));
      return new Response(JSON.stringify(linhas), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const linhas = await selectRows<{ id: string }>('cmd_members', {
      select: 'id',
      filters: { id: `in.(${ids.join(',')})` },
    });

    // Nenhuma URL passa do limite, e nenhuma linha se perde no caminho.
    expect(urls.length).toBe(Math.ceil(1000 / IN_FILTER_CHUNK));
    for (const url of urls) expect(url.length).toBeLessThan(8000);
    expect(linhas).toHaveLength(1000);
    expect(linhas[0].id).toBe(ids[0]);
    expect(linhas[999].id).toBe(ids[999]);

    // Nenhum valor pode chegar ao banco com aspas a mais: `""uuid""` e
    // recusado com 22P02, e foi assim que o mapa e a equipe caíram.
    for (const url of urls) {
      const filtro = new URL(url).searchParams.get('id') ?? '';
      expect(filtro).not.toContain('""');
    }

    vi.restoreAllMocks();
  });
});
