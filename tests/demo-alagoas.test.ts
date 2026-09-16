import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapLocationRow } from '@/lib/supabase/tables';

/**
 * Coordenadas do Time DEMO.
 *
 * Este arquivo existe por causa de um print: o mapa de um Time DEMO abria em
 * Recife, com marcadores no mar. A causa nao estava no mapa — estava em
 * coordenadas escritas de memoria e depois deslocadas ao acaso.
 *
 * O que se prova aqui e o contrario disso: nenhuma coordenada e inventada,
 * toda coordenada vem da consulta do endereco, e o que cai fora de Alagoas,
 * no `0,0` ou em lugar nenhum simplesmente NAO vira ponto.
 */

const MACEIO = {
  latitude: -9.6658,
  longitude: -35.7353,
  title: 'Colégio Rosalvo Ribeiro dos Santos',
  address: 'R. Bonfim, 344 - Jacintinho, Maceió - AL',
  placeId: 'PL-AL-1',
  dataId: 'DT-AL-1',
  imageUrl: null,
};

/** O erro do print: um ponto em Recife, a 200 km do estado. */
const RECIFE = { ...MACEIO, latitude: -8.0476, longitude: -34.877, placeId: 'PL-PE-1' };

/** O outro erro do print: a "ilha nula", no golfo da Guine. */
const ILHA_NULA = { ...MACEIO, latitude: 0, longitude: 0, placeId: 'PL-0' };

const db: { places: MapLocationRow[] } = { places: [] };
const consultas: string[] = [];
let resposta: typeof MACEIO | null = MACEIO;
let falha: Error | null = null;

vi.mock('@/lib/supabase/rest', () => ({
  selectOne: async (table: string, options: { filters?: Record<string, string> }) => {
    if (table !== 'cmd_map_locations') return null;
    const hash = String(options.filters?.query_hash ?? '').slice(3);
    return db.places.find((row) => row.query_hash === hash) ?? null;
  },
  insertOne: async (table: string, values: Record<string, unknown>) => {
    if (table !== 'cmd_map_locations') return null;
    const row = { id: `loc-${db.places.length + 1}`, ...values } as MapLocationRow;
    db.places.push(row);
    return row;
  },
  selectRows: async () => [],
  insertRows: async () => [],
  updateRows: async () => [],
  deleteRows: async () => [],
  inFilter: (values: readonly string[]) => `in.(${values.join(',')})`,
  callFunction: async () => [],
}));

vi.mock('@/lib/server/serpapi.service', () => ({
  MapLookupError: class MapLookupError extends Error {
    readonly code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  lookupPlace: async (query: string) => {
    consultas.push(query);
    if (falha) throw falha;
    return resposta;
  },
}));

const { pollingPlaceLookup, residenceLookupFor, resolveDemoPoint } = await import(
  '@/lib/server/demo-locations'
);
const { DEMO_ADDRESSES, DEMO_POLLING_PLACES, isUsableDemoCoordinate } = await import(
  '@/lib/domain/demo-catalog'
);

/** Uma escola com endereço completo, e a rua dela, as duas do catálogo. */
const ESCOLA = DEMO_POLLING_PLACES.find((place) => place.id === 'mcz-rosalvo-ribeiro-dos-santos')!;
const RUA = DEMO_ADDRESSES.find((address) => address.id === `end-${ESCOLA.id}`)!;

/** O que a consulta da moradia recebe: rua, bairro, município e UF. */
const MORADIA = {
  street: RUA.street,
  district: RUA.district,
  city: RUA.city,
  state: RUA.state,
};

function addressLookup(): string {
  return residenceLookupFor(MORADIA)?.query ?? '';
}

beforeEach(() => {
  db.places = [];
  consultas.length = 0;
  resposta = MACEIO;
  falha = null;
});

describe('barreiras de coordenada do Time DEMO', () => {
  it('recusa o que não pode virar pino', () => {
    // Exatamente os quatro casos do print e da especificacao.
    expect(isUsableDemoCoordinate(RECIFE.latitude, RECIFE.longitude)).toBe(false);
    expect(isUsableDemoCoordinate(0, 0)).toBe(false);
    expect(isUsableDemoCoordinate(null, null)).toBe(false);
    expect(isUsableDemoCoordinate(Number.NaN, -35.7)).toBe(false);
    // Ponto no oceano, a leste do litoral alagoano.
    expect(isUsableDemoCoordinate(-9.6, -34.5)).toBe(false);

    expect(isUsableDemoCoordinate(MACEIO.latitude, MACEIO.longitude)).toBe(true);
  });

  it('a moradia sai com a precisão do endereço, nunca como a casa exata', () => {
    // Rua conhecida: o ponto é o da rua.
    expect(residenceLookupFor(MORADIA)?.precision).toBe('STREET');

    // Município cuja divulgação não trouxe rua nenhuma: o ponto desce para o
    // bairro, e a tela diz isso. Inventar uma rua seria o contrário disso.
    expect(
      residenceLookupFor({
        street: null,
        district: 'Conjunto Antônio Lins',
        city: 'Rio Largo',
        state: 'AL',
      })?.precision,
    ).toBe('DISTRICT');
  });

  it('pergunta pelo endereço publicado, e nunca por dado de pessoa', () => {
    const escola = pollingPlaceLookup(ESCOLA) ?? '';
    const rua = addressLookup();

    expect(escola).toContain(ESCOLA.name);
    expect(escola).toContain('Maceió - AL');
    // O numero da casa nunca entra na consulta da moradia: o ponto mostrado
    // e o da RUA.
    expect(rua).toContain(RUA.street);
    expect(rua).toContain('Maceió - AL');
    expect(rua).not.toMatch(/\d{2,}/);
  });
});

describe('resolução das coordenadas', () => {
  it('grava o ponto encontrado e diz de onde ele veio', async () => {
    const query = pollingPlaceLookup(ESCOLA) as string;
    const outcome = await resolveDemoPoint(query, { city: ESCOLA.city, state: ESCOLA.state });

    expect(outcome.point?.latitude).toBe(MACEIO.latitude);
    expect(outcome.point?.longitude).toBe(MACEIO.longitude);
    expect(outcome.point?.created).toBe(true);
    // A linha diz a verdade sobre a origem: a consulta aconteceu.
    expect(db.places[0].provider).toBe('SERPAPI_GOOGLE_MAPS');
  });

  it('não consulta duas vezes o mesmo endereço', async () => {
    const query = pollingPlaceLookup(ESCOLA) as string;
    const expected = { city: ESCOLA.city, state: ESCOLA.state };

    const primeira = await resolveDemoPoint(query, expected);
    const segunda = await resolveDemoPoint(query, expected);

    // Cada consulta e cobrada: o segundo Time DEMO aproveita o cache do
    // primeiro, porque a chave e o endereco, e nao o time.
    expect(consultas).toHaveLength(1);
    expect(segunda.point?.locationId).toBe(primeira.point?.locationId);
    expect(segunda.point?.created).toBe(false);
  });

  it('descarta o resultado fora de Alagoas, sem gravar nada', async () => {
    resposta = RECIFE;
    const query = pollingPlaceLookup(ESCOLA) as string;
    const outcome = await resolveDemoPoint(query, { city: ESCOLA.city, state: ESCOLA.state });

    expect(outcome.point).toBeNull();
    // Nao entra no cache: um ponto errado estragaria tambem a consulta de um
    // time real que um dia pergunte o mesmo endereco.
    expect(db.places).toHaveLength(0);
  });

  it('descarta o `0,0`', async () => {
    resposta = ILHA_NULA;
    const query = addressLookup();
    const outcome = await resolveDemoPoint(query, { city: RUA.city, state: RUA.state });

    expect(outcome.point).toBeNull();
    expect(db.places).toHaveLength(0);
  });

  it('sem resultado confiável, fica sem ponto — e não com um ponto qualquer', async () => {
    resposta = null;
    const query = addressLookup();
    const outcome = await resolveDemoPoint(query, { city: RUA.city, state: RUA.state });

    expect(outcome.point).toBeNull();
    expect(outcome.error).toBeNull();
  });

  it('falha de consulta vira motivo, nunca coordenada inventada', async () => {
    const { MapLookupError } = await import('@/lib/server/serpapi.service');
    falha = new MapLookupError('MISSING_CONFIG');

    const query = addressLookup();
    const outcome = await resolveDemoPoint(query, { city: RUA.city, state: RUA.state });

    expect(outcome.point).toBeNull();
    expect(outcome.error).toBe('MISSING_CONFIG');
    expect(db.places).toHaveLength(0);
  });
});
