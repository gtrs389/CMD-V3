import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Isolamento do Time DEMO.
 *
 * Um time de demonstracao existe para ser apresentado, e nao para entrar nos
 * numeros da operacao. O recorte vive em um lugar so — `demo-scope` — e e
 * dele que dependem o total de integrantes, o grafico, o mapa geral e a
 * lista de pessoas de um local.
 *
 * Duas coisas sao conferidas aqui, e as duas importam:
 *
 *   1. com Time DEMO cadastrado, a consulta sai recortada;
 *   2. SEM nenhum Time DEMO, a consulta sai exatamente como sempre foi — sem
 *      uma clausula a mais. Quem nunca criou um time de demonstracao nao
 *      paga nada por esta funcionalidade existir.
 */

const estado = { demoIds: [] as string[] };
const consultas: { tabela: string; filtros: Record<string, string> }[] = [];

vi.mock('@/lib/supabase/rest', async () => {
  const real = await vi.importActual<typeof import('@/lib/supabase/rest')>(
    '@/lib/supabase/rest',
  );

  return {
    ...real,
    selectRows: async (table: string, options: { filters?: Record<string, string> }) => {
      consultas.push({ tabela: table, filtros: options.filters ?? {} });
      if (table === 'cmd_clients') return estado.demoIds.map((id) => ({ id }));
      return [];
    },
  };
});

const { demoClientIds, withoutDemoClients } = await import('@/lib/server/demo-scope');

beforeEach(() => {
  consultas.length = 0;
  estado.demoIds = [];
});

describe('recorte dos Times DEMO', () => {
  it('não muda nada quando não existe Time DEMO', async () => {
    expect(await demoClientIds()).toEqual([]);
    expect(await withoutDemoClients()).toEqual({});
  });

  it('tira os Times DEMO das consultas por time', async () => {
    estado.demoIds = ['time-demo-1', 'time-demo-2'];

    const filtro = await withoutDemoClients();

    expect(filtro.client_id).toBe('not.in.("time-demo-1","time-demo-2")');
  });

  it('pergunta ao banco apenas pelos times marcados como DEMO', async () => {
    estado.demoIds = ['time-demo-1'];
    await demoClientIds();

    const consulta = consultas.find((item) => item.tabela === 'cmd_clients');
    expect(consulta?.filtros.is_demo).toBe('is.true');
  });
});
