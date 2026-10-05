import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const chamadas: { fn: string; args: Record<string, unknown> }[] = [];
const gravadas: { tabela: string; linhas: Record<string, unknown>[] }[] = [];
const atualizadas: { tabela: string; valores: Record<string, unknown> }[] = [];
let travaLivre = true;
let estado: Record<string, unknown> | null = null;
let fila: Record<string, unknown>[] = [];
const consultas: Record<string, string>[] = [];

vi.mock('@/lib/supabase/rest', () => ({
  callFunction: vi.fn(async (fn: string, args: Record<string, unknown>) => {
    chamadas.push({ fn, args });
    return fn === 'cmd_tse_live_lock' ? travaLivre : 1;
  }),
  selectOne: vi.fn(async () => estado),
  selectRows: vi.fn(async (_t: string, opcoes: { filters?: Record<string, string> }) => {
    consultas.push(opcoes.filters ?? {});
    return fila;
  }),
  upsertRows: vi.fn(async (tabela: string, linhas: Record<string, unknown>[]) => {
    gravadas.push({ tabela, linhas });
  }),
  insertRows: vi.fn(async (tabela: string, linhas: Record<string, unknown>[]) => {
    gravadas.push({ tabela, linhas });
    return [];
  }),
  updateRows: vi.fn(async (tabela: string, _f: unknown, valores: Record<string, unknown>) => {
    atualizadas.push({ tabela, valores });
    return [];
  }),
}));

const { coletarAoVivo, motivoDaRecusa } = await import('@/lib/server/votacao-ao-vivo.service');

/** Um boletim de verdade (exemplo do TSE): zona 8, secao 1. */
const BU = readFileSync(join(__dirname, 'fixtures', 'bu', 's02100-0112000080001.bu'));
const BASE = 'https://resultados.tse.jus.br/oficial/ele2026';

/** O TSE simulado: so responde os enderecos esperados. */
const pedidos: string[] = [];
function tse(respostas: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      pedidos.push(url);
      const r = respostas[url];
      if (r === undefined) return new Response('', { status: 404 });
      if (r instanceof Uint8Array) return new Response(new Blob([new Uint8Array(r)]), { status: 200 });
      if (typeof r === 'number') return new Response('', { status: r });
      return new Response(JSON.stringify(r), { status: 200 });
    }),
  );
}

beforeEach(() => {
  chamadas.length = 0;
  gravadas.length = 0;
  atualizadas.length = 0;
  pedidos.length = 0;
  consultas.length = 0;
  travaLivre = true;
  estado = { sections_total: 0, sections_done: 0, names_at: null, last_run_at: null, paused_until: null };
  fila = [
    { city_code: 1120, zone: 8, section: 1 },
    { city_code: 1120, zone: 8, section: 2 },
  ];
});

describe('coleta ao vivo dos boletins de urna', () => {
  it('lista as seções, lê os nomes, baixa o boletim que chegou e consolida', async () => {
    const dir = `${BASE}/arquivo-urna/3220/dados/al/01120/0008`;
    tse({
      [`${BASE}/arquivo-urna/3220/config/al/al-p003220-cs.json`]: {
        abr: [
          {
            cd: 'AL',
            mu: [{ cd: '01120', zon: [{ cd: '0008', sec: [{ ns: '0001', da: '04/10/2026', ha: '17:31:26' }, { ns: '0002' }] }] }],
          },
        ],
      },
      [`${BASE}/6259/dados/al/al-c0007-e006259-u.json`]: {
        carg: [{ agr: [{ par: [{ n: '91', sg: 'P91', cand: [{ n: '91002', nmu: 'CANDIDATO 91002' }] }] }] }],
      },
      [`${dir}/0001/p003220-al-m01120-z0008-s0001-aux.json`]: {
        st: 'Totalizada',
        hashes: [{ hash: 'abc', st: 'Totalizado', dr: '04/10/2026', hr: '17:31:26', arq: [{ nm: 'o.bu', tp: 'bu' }] }],
      },
      [`${dir}/0001/abc/o.bu`]: new Uint8Array(BU),
      // Secao 2: o boletim ainda nao saiu (404).
    });

    const r = await coletarAoVivo(10_000);

    expect(r).toMatchObject({ coletou: true, novas: 1 });
    // A lista de secoes entrou no banco.
    const secoes = gravadas.find((g) => g.tabela === 'cmd_tse_live_sections' && g.linhas.length === 2 && !('checked_at' in g.linhas[0]));
    expect(secoes?.linhas).toEqual([
      { pleito: 3220, uf: 'AL', city_code: 1120, zone: 8, section: 1, arrived_at: '04/10/2026 17:31:26' },
      { pleito: 3220, uf: 'AL', city_code: 1120, zone: 8, section: 2, arrived_at: null },
    ]);
    // Com o sinal de chegada na lista, a fila so pega quem ja chegou.
    expect(consultas.at(-1)).toMatchObject({ votes: 'is.null', arrived_at: 'not.is.null' });
    // Os nomes.
    const nomes = gravadas.filter((g) => g.tabela === 'cmd_tse_live_candidates').flatMap((g) => g.linhas);
    expect(nomes).toContainEqual(expect.objectContaining({ office_code: 7, number: '91002', name: 'CANDIDATO 91002', kind: 'CANDIDATO' }));
    // O boletim da secao 1, e a secao 2 marcada para rever depois.
    const lidas = gravadas.filter((g) => g.tabela === 'cmd_tse_live_sections').flatMap((g) => g.linhas).filter((l) => 'checked_at' in l);
    const s1 = lidas.find((l) => l.section === 1)!;
    expect(s1).toMatchObject({ hash: 'abc', status: 'Totalizado', received_at: '04/10/2026 17:31:26', place_number: 1, turnout: 4 });
    expect(s1.votes).toMatchObject({ '7:91002': 1, '6:9102': 1, '1:91': 2 });
    expect(lidas.find((l) => l.section === 2)).toMatchObject({ status: 'não publicado' });
    expect(lidas.find((l) => l.section === 2)?.votes ?? null).toBeNull();
    // Consolidou e soltou a trava.
    expect(chamadas.map((c) => c.fn)).toEqual(['cmd_tse_live_lock', 'cmd_tse_live_consolidate']);
    expect(atualizadas.at(-1)?.valores).toMatchObject({ sections_total: 2, sections_done: 1, last_error: null });
  });

  it('com outra coleta rodando, não consulta o TSE', async () => {
    travaLivre = false;
    tse({});
    const r = await coletarAoVivo(10_000);
    expect(r).toMatchObject({ coletou: false, novas: 0 });
    expect(pedidos).toEqual([]);
  });

  it('recusas seguidas do TSE pausam a coleta, sem consolidar nada', async () => {
    estado = { sections_total: 2, sections_done: 0, names_at: new Date().toISOString(), paused_until: null };
    fila = Array.from({ length: 8 }, (_, i) => ({ city_code: 1120, zone: 8, section: i + 1 }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })));

    await coletarAoVivo(10_000);

    expect(atualizadas.some((a) => 'paused_until' in a.valores)).toBe(true);
    expect(atualizadas.at(-1)?.valores.last_error).toMatch(/pausou/);
    expect(chamadas.map((c) => c.fn)).toEqual(['cmd_tse_live_lock']);
  });

  it('se o TSE recusa a lista de seções, o motivo fica guardado e explica o que fazer', async () => {
    tse({ [`${BASE}/arquivo-urna/3220/config/al/al-p003220-cs.json`]: 403 });
    const r = await coletarAoVivo(10_000);
    expect(r.coletou).toBe(true);
    expect(atualizadas.at(-1)?.valores.last_error).toMatch(/fora do Brasil.*gru1/);
    expect(chamadas.map((c) => c.fn)).toEqual(['cmd_tse_live_lock']);

    expect(motivoDaRecusa(0)).toMatch(/não respondeu/);
    expect(motivoDaRecusa(404)).toMatch(/ainda não publicou/);
  });

  it('guarda o resultado de cada cargo, o retrato da noite e a linha do tempo; mesma versão não regrava', async () => {
    estado = { sections_total: 2, sections_done: 0, names_at: null, list_at: new Date().toISOString(), paused_until: null };
    fila = [];
    const senado = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'tse', 'senador-sp-u.json'), 'utf8'));
    tse({ [`${BASE}/6259/dados/al/al-c0005-e006259-u.json`]: senado });

    await coletarAoVivo(10_000);

    const resultado = gravadas.find((g) => g.tabela === 'cmd_tse_live_results')!;
    expect(resultado.linhas[0]).toMatchObject({ pleito: 3220, uf: 'AL', office_code: 5, version: '176953242' });
    expect((resultado.linhas[0].payload as { candidatos: unknown[] }).candidatos.length).toBeGreaterThan(5);
    const retrato = gravadas.find((g) => g.tabela === 'cmd_tse_live_history')!;
    expect(retrato.linhas[0]).toMatchObject({ office_code: 5, pct_sections: 100, tse_time: '16:44' });
    const eventos = gravadas.filter((g) => g.tabela === 'cmd_tse_live_events').flatMap((g) => g.linhas);
    expect(eventos).toContainEqual(expect.objectContaining({ kind: 'MARCO', text: 'Senador: todas as seções totalizadas' }));
    // Os nomes tambem saem do mesmo arquivo, com o total oficial.
    expect(gravadas.filter((g) => g.tabela === 'cmd_tse_live_candidates').flatMap((g) => g.linhas)).toContainEqual(
      expect.objectContaining({ office_code: 5, number: '862', official_votes: 2057170 }),
    );
  });
});
