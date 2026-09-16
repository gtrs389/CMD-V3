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

beforeEach(() => {
  urlsChamadas.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urlsChamadas.push(String(url));
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
});

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
