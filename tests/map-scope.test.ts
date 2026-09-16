import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O mapa de UM time, com um banco em memoria.
 *
 * A pagina de um time mostrava o mapa vazio — zero votos, zero pessoas, zero
 * locais e zero PENDENTES, que e o sinal de que nao houve filtro nenhum: nao
 * havia dado. A equipe estava cadastrada e antes aparecia.
 *
 * A causa nao estava no time: o mapa lia os 2.000 vinculos MAIS RECENTES do
 * sistema inteiro e so depois peneirava, em memoria, os daquele time. Um
 * Time DEMO recem-gerado — que hoje vai a 5.000 pessoas — tomava a janela
 * inteira por ser o mais recente, e o time real, mais antigo, nem vinha na
 * consulta.
 *
 * Este teste reproduz exatamente isso: o banco tem MUITO mais vinculos do
 * outro time, todos mais novos, do que a janela comporta.
 */

interface Row {
  [key: string]: unknown;
}

const db: Record<string, Row[]> = {
  cmd_member_locations: [],
  cmd_members: [],
  cmd_map_locations: [],
  cmd_clients: [],
  cmd_member_verifications: [],
  cmd_form_fields: [],
  cmd_member_responses: [],
};

function matches(row: Row, filters: Record<string, string> = {}): boolean {
  return Object.entries(filters).every(([column, expression]) => {
    const value = row[column];
    if (expression.startsWith('eq.')) return String(value) === expression.slice(3);
    if (expression.startsWith('in.(')) {
      const lista = expression
        .slice(4, -1)
        .split(',')
        .map((item) => item.replace(/^"|"$/g, ''));
      return lista.includes(String(value));
    }
    return true;
  });
}

vi.mock('@/lib/supabase/rest', () => ({
  inFilter: (values: readonly string[]) => `in.(${values.map((v) => `"${v}"`).join(',')})`,
  notInFilter: (values: readonly string[]) => `not.in.(${values.map((v) => `"${v}"`).join(',')})`,
  /**
   * Respeita `order` e `limit` — sem isso o teste nao teria como reprovar o
   * defeito, que so aparece quando a JANELA corta.
   */
  selectRows: async (
    table: string,
    options: { filters?: Record<string, string>; order?: string; limit?: number } = {},
  ) => {
    let linhas = db[table].filter((row) => matches(row, options.filters));

    if (options.order === 'updated_at.desc') {
      linhas = linhas
        .slice()
        .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')));
    }
    if (typeof options.limit === 'number') linhas = linhas.slice(0, options.limit);

    return linhas.map((row) => ({ ...row }));
  },
  selectOne: async () => null,
  insertOne: async (table: string, value: Row) => ({ id: 'novo', ...value }),
  updateRows: async () => [],
  deleteRows: async () => [],
}));

vi.mock('@/lib/supabase/storage', () => ({
  signedUrls: async (paths: (string | null)[]) => paths.map(() => null),
}));
vi.mock('@/lib/server/crypto', () => ({ decryptJson: () => null }));
vi.mock('@/lib/server/demo-scope', () => ({ withoutDemoClients: async () => ({}) }));
vi.mock('@/lib/server/serpapi.service', () => ({
  lookupPlace: async () => null,
  MapLookupError: class extends Error {},
}));

const TIME_REAL = 'time-real';
const TIME_GRANDE = 'time-grande';

/** Mais vinculos do que a janela de 2.000 comporta, e todos mais NOVOS. */
const VOLUME_DO_OUTRO_TIME = 2500;

beforeEach(() => {
  for (const tabela of Object.keys(db)) db[tabela] = [];

  db.cmd_clients.push(
    { id: TIME_REAL, name: 'Time Montenegro', is_demo: false },
    { id: TIME_GRANDE, name: 'Time DEMO', is_demo: true },
  );

  db.cmd_map_locations.push({
    id: 'local-1',
    latitude: -9.66,
    longitude: -35.73,
    title: 'Escola Municipal',
    address: 'Maceió, AL',
    place_id: null,
    data_id: null,
    image_url: null,
  });

  // O time real: gente cadastrada ha mais tempo.
  for (let i = 0; i < 3; i += 1) {
    const memberId = `real-${i}`;
    db.cmd_members.push({
      id: memberId,
      client_id: TIME_REAL,
      name: `Integrante ${i}`,
      phone: '82999990000',
      gender: 'F',
      photo_path: null,
      street: null,
      district: null,
      city: 'Maceió',
      state: 'AL',
      zone: '001',
      section: '0010',
    });
    db.cmd_member_locations.push({
      id: `v-real-${i}`,
      member_id: memberId,
      location_id: 'local-1',
      location_kind: 'POLLING_PLACE',
      status: 'SUCCESS',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
  }

  // O outro time, gerado agora: enche a janela inteira com vinculos novos.
  for (let i = 0; i < VOLUME_DO_OUTRO_TIME; i += 1) {
    const memberId = `grande-${i}`;
    db.cmd_members.push({
      id: memberId,
      client_id: TIME_GRANDE,
      name: `Pessoa ${i}`,
      phone: '82988880000',
      gender: 'M',
      photo_path: null,
      street: null,
      district: null,
      city: 'Maceió',
      state: 'AL',
      zone: '002',
      section: '0020',
    });
    db.cmd_member_locations.push({
      id: `v-grande-${i}`,
      member_id: memberId,
      location_id: 'local-1',
      location_kind: 'POLLING_PLACE',
      status: 'SUCCESS',
      updated_at: '2026-09-16T12:00:00.000Z',
    });
  }
});

describe('mapa de um time', () => {
  it('mostra a equipe mesmo com outro time enchendo a janela de vinculos', async () => {
    const { mapOverview } = await import('@/lib/server/map-location.service');
    const mapa = await mapOverview(TIME_REAL);

    // O que a tela mostrava: tudo zerado.
    expect(mapa.totals.pollingPlace).toBe(3);
    expect(mapa.pollingPlaces.length).toBe(1);
    expect(mapa.pollingPlaces[0].total).toBe(3);
  });

  it('nao traz de volta vinculo de outro time', async () => {
    const { mapOverview } = await import('@/lib/server/map-location.service');
    const mapa = await mapOverview(TIME_REAL);

    // O recorte continua sendo o time pedido: o volume do outro nao entra.
    expect(mapa.totals.pollingPlace).toBe(3);
    expect(mapa.totals.residence).toBe(0);
  });
});
