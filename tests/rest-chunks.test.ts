import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Lista longa de identificadores em ESCRITA.
 *
 * O filtro `in.(...)` viaja na URL. Algumas centenas de identificadores
 * passam do que o servidor aceita, e a requisicao inteira volta como erro —
 * sem codigo do Postgres, porque nem chegou a virar consulta. E o erro que
 * aparece como "Erro no banco: null".
 *
 * A leitura ja saia em lotes desde que uma pagina de Time DEMO morreu assim.
 * A escrita nao: a regra estava escrita so em `selectRows`, e a promessa de
 * que "uma regra em um lugar so nao tem como ser esquecida" nao se cumpriu.
 * A primeira escrita que recebeu centenas de identificadores — apagar a
 * segunda camada de um Time DEMO — morreu do mesmo jeito.
 */

vi.mock('@/lib/supabase/env', () => ({
  supabaseEnv: () => ({ url: 'https://exemplo.supabase.co', key: 'chave-de-teste' }),
  supabaseAuthHeaders: (extra?: HeadersInit) => new Headers(extra),
  isSupabaseConfigured: () => true,
  SupabaseConfigError: class extends Error {},
}));

const urlsChamadas: string[] = [];

/** Quantas linhas o servidor de mentira devolve, ao todo. */
let totalNoBanco = 0;

beforeEach(() => {
  urlsChamadas.length = 0;
  totalNoBanco = 0;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const endereco = String(url);
      urlsChamadas.push(endereco);

      // Reproduz o corte do Supabase: no maximo 1.000 linhas por resposta,
      // com status 200 e sem aviso nenhum de que havia mais.
      const params = new URL(endereco).searchParams;
      const limite = Math.min(Number(params.get('limit') ?? PAGINA), PAGINA);
      const inicio = Number(params.get('offset') ?? 0);
      const quantas = Math.max(0, Math.min(limite, totalNoBanco - inicio));
      const linhas = Array.from({ length: quantas }, (_, i) => ({ id: `linha-${inicio + i}` }));

      return new Response(JSON.stringify(linhas), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});

/** O corte do servidor. */
const PAGINA = 1000;

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Com folga acima do limite de 150 por lote. */
const MUITOS = Array.from({ length: 400 }, (_, i) => `id-${i}`);

describe('escrita com lista longa', () => {
  it('deleteRows sai em lotes, e nenhuma URL fica gigante', async () => {
    const { deleteRows, inFilter } = await import('@/lib/supabase/rest');

    await deleteRows('cmd_members', { id: inFilter(MUITOS) });

    // 400 identificadores, 150 por vez: tres requisicoes.
    expect(urlsChamadas).toHaveLength(3);
    for (const url of urlsChamadas) {
      expect(url.length).toBeLessThan(10_000);
    }
  });

  it('updateRows sai em lotes', async () => {
    const { updateRows, inFilter } = await import('@/lib/supabase/rest');

    await updateRows('cmd_members', { id: inFilter(MUITOS) }, { recruited_by_role: 'CANDIDATE' });

    expect(urlsChamadas).toHaveLength(3);
  });

  it('nenhum identificador se perde no fatiamento', async () => {
    const { deleteRows, inFilter } = await import('@/lib/supabase/rest');

    await deleteRows('cmd_members', { id: inFilter(MUITOS) });

    const enviados = urlsChamadas.flatMap((url) => {
      const trecho = decodeURIComponent(url).match(/in\.\(([^)]*)\)/)?.[1] ?? '';
      return trecho.split(',').map((item) => item.replace(/^"|"$/g, ''));
    });

    expect(new Set(enviados).size).toBe(MUITOS.length);
    for (const id of MUITOS) expect(enviados).toContain(id);
  });

  it('lista curta continua em UMA requisicao', async () => {
    const { deleteRows, inFilter } = await import('@/lib/supabase/rest');

    await deleteRows('cmd_members', { id: inFilter(['a', 'b', 'c']) });

    expect(urlsChamadas).toHaveLength(1);
  });
});

describe('leitura alem da primeira pagina', () => {
  /**
   * O Supabase corta toda resposta em 1.000 linhas, com status 200 e sem
   * aviso. Uma consulta sem `limit` parecia trazer "todas" e trazia mil.
   *
   * Foi assim que a pagina de um Time DEMO de 1.553 pessoas mostrou 1.000 em
   * todos os quadros, com o ranking da equipe zerado: os recrutadores sao as
   * pessoas mais ANTIGAS, e ficavam fora da janela devolvida.
   */
  it('traz TODAS as linhas, e nao so as mil primeiras', async () => {
    const { selectRows } = await import('@/lib/supabase/rest');
    totalNoBanco = 1553;

    const linhas = await selectRows('cmd_members', {
      filters: { client_id: 'eq.demo-1' },
      order: 'created_at.desc',
    });

    expect(linhas).toHaveLength(1553);
    // Duas paginas: 1.000 e 553.
    expect(urlsChamadas).toHaveLength(2);
  });

  it('nenhuma linha repetida entre as paginas', async () => {
    const { selectRows } = await import('@/lib/supabase/rest');
    totalNoBanco = 2500;

    const linhas = await selectRows<{ id: string }>('cmd_members', {});

    expect(new Set(linhas.map((l) => l.id)).size).toBe(2500);
  });

  it('consulta pequena continua custando UMA requisicao', async () => {
    const { selectRows } = await import('@/lib/supabase/rest');
    totalNoBanco = 12;

    await selectRows('cmd_clients', {});

    expect(urlsChamadas).toHaveLength(1);
  });

  it('com `limit` explicito, quem chamou manda: uma requisicao so', async () => {
    const { selectRows } = await import('@/lib/supabase/rest');
    totalNoBanco = 5000;

    const linhas = await selectRows('cmd_members', { limit: 10 });

    expect(urlsChamadas).toHaveLength(1);
    expect(linhas).toHaveLength(10);
  });

  it('pagina com ordem definida: sem ela o banco nao promete ordem entre consultas', async () => {
    const { selectRows } = await import('@/lib/supabase/rest');
    totalNoBanco = 1200;

    await selectRows('cmd_members', {});

    for (const url of urlsChamadas) {
      expect(new URL(url).searchParams.get('order')).toBeTruthy();
    }
  });
});
