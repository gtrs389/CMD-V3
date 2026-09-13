import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_QUERY,
  activeFilterCount,
  applyMapQuery,
  clearFilters,
  mapOptions,
  normalizeZone,
  placeVotes,
  rankPlaces,
  sectionsInZone,
  type MapQuery,
} from '@/lib/domain/map-filters';
import type { MapPin, PollingPlacePin } from '@/lib/domain/map-pin';

function pin(over: Partial<MapPin> = {}): MapPin {
  return {
    memberId: 'm1',
    memberName: 'José da Silva',
    memberPhoto: null,
    clientId: 'c1',
    clientName: 'Time Bezerra',
    locationKind: 'RESIDENCE',
    latitude: -3.7,
    longitude: -38.5,
    place: 'Rua das Flores',
    district: 'Centro',
    city: 'Fortaleza',
    state: 'CE',
    zone: '07',
    section: '0123',
    precision: 'STREET',
    phone: null,
    email: null,
    ...over,
  };
}

function place(over: Partial<PollingPlacePin> = {}): PollingPlacePin {
  return {
    locationId: 'p1',
    latitude: -3.73,
    longitude: -38.52,
    title: 'Escola Municipal Castelo',
    address: 'Av. Central, 100',
    city: 'Fortaleza',
    state: 'CE',
    imageUrl: null,
    total: 30,
    men: 12,
    women: 16,
    others: 2,
    sections: [
      { zone: '07', section: '0123', total: 20 },
      { zone: '12', section: '0044', total: 10 },
    ],
    ...over,
  };
}

const payload = {
  pins: [
    pin(),
    pin({ memberId: 'm2', memberName: 'Maria Souza', city: 'Sobral', zone: '12' }),
    pin({ memberId: 'm3', memberName: 'Ana Lima', state: 'PI', city: 'Teresina', zone: '1' }),
  ],
  pollingPlaces: [
    place(),
    place({
      locationId: 'p2',
      title: 'Colégio Estadual Norte',
      city: 'Sobral',
      total: 8,
      sections: [{ zone: '12', section: '0090', total: 8 }],
    }),
    place({
      locationId: 'p3',
      title: 'Escola Rural Sul',
      state: 'PI',
      city: 'Teresina',
      total: 50,
      sections: [{ zone: '1', section: '0001', total: 50 }],
    }),
  ],
};

describe('normalizeZone', () => {
  it('trata o mesmo número escrito de dois jeitos como uma zona só', () => {
    expect(normalizeZone('07')).toBe(normalizeZone('7'));
    expect(normalizeZone(null)).toBe('');
    expect(normalizeZone(' 0012 ')).toBe('12');
  });
});

describe('placeVotes', () => {
  it('sem zona escolhida, vale a estimativa inteira da escola', () => {
    expect(placeVotes(place(), null)).toBe(30);
  });

  it('com zona escolhida, conta somente as seções daquela zona', () => {
    expect(placeVotes(place(), '07')).toBe(20);
    expect(placeVotes(place(), '7')).toBe(20);
    expect(placeVotes(place(), '12')).toBe(10);
  });

  it('não inventa divisão proporcional para zona sem seção', () => {
    expect(placeVotes(place(), '99')).toBe(0);
  });
});

describe('applyMapQuery', () => {
  const query = (over: Partial<MapQuery> = {}): MapQuery => ({ ...DEFAULT_MAP_QUERY, ...over });

  it('sem filtro, devolve tudo e soma os votos', () => {
    const result = applyMapQuery(payload, query());
    expect(result.pins).toHaveLength(3);
    expect(result.places).toHaveLength(3);
    expect(result.votes).toBe(30 + 8 + 50);
  });

  it('a visão "Pessoas" não traz local de votação, e vice-versa', () => {
    expect(applyMapQuery(payload, query({ kind: 'RESIDENCE' })).places).toHaveLength(0);
    expect(applyMapQuery(payload, query({ kind: 'POLLING_PLACE' })).pins).toHaveLength(0);
  });

  it('filtra por estado e por cidade', () => {
    const ceara = applyMapQuery(payload, query({ state: 'CE' }));
    expect(ceara.pins.map((item) => item.memberId)).toEqual(['m1', 'm2']);
    expect(ceara.places.map((item) => item.locationId)).toEqual(['p1', 'p2']);

    const sobral = applyMapQuery(payload, query({ city: 'Sobral' }));
    expect(sobral.places.map((item) => item.locationId)).toEqual(['p2']);
  });

  it('filtrar por zona recorta também a contagem de votos', () => {
    const zona = applyMapQuery(payload, query({ zone: '12' }));
    // A escola Castelo atende a zona 12, mas só com 10 dos seus 30 votos.
    expect(zona.places.map((item) => item.locationId)).toEqual(['p1', 'p2']);
    expect(zona.votes).toBe(10 + 8);
  });

  it('esconde o que está abaixo do tamanho mínimo', () => {
    const grandes = applyMapQuery(payload, query({ minVotes: 25 }));
    expect(grandes.places.map((item) => item.locationId)).toEqual(['p1', 'p3']);
  });

  it('o mínimo é medido no recorte da zona, não no total da escola', () => {
    const recorte = applyMapQuery(payload, query({ zone: '12', minVotes: 9 }));
    // Castelo tem 30 no total, mas só 10 na zona 12; Norte tem 8 e sai.
    expect(recorte.places.map((item) => item.locationId)).toEqual(['p1']);
  });

  it('busca livre alcança pessoa, escola, rua e bairro, ignorando acento', () => {
    expect(applyMapQuery(payload, query({ search: 'jose' })).pins).toHaveLength(1);
    expect(applyMapQuery(payload, query({ search: 'colegio' })).places).toHaveLength(1);
    expect(applyMapQuery(payload, query({ search: 'flores' })).pins).toHaveLength(3);
  });

  it('aguenta mapa vazio', () => {
    const vazio = applyMapQuery(null, query());
    expect(vazio.pins).toEqual([]);
    expect(vazio.places).toEqual([]);
    expect(vazio.votes).toBe(0);
  });
});

describe('mapOptions', () => {
  it('oferece só o que existe nos dados, sem repetir', () => {
    const options = mapOptions(payload, null);
    expect(options.states).toEqual(['CE', 'PI']);
    expect(options.cities).toEqual(['Fortaleza', 'Sobral', 'Teresina']);
    expect(options.zones).toEqual(['1', '7', '12']);
  });

  it('as cidades acompanham o estado escolhido', () => {
    expect(mapOptions(payload, 'PI').cities).toEqual(['Teresina']);
  });
});

describe('rankPlaces', () => {
  it('ordena do maior para o menor e mede a barra pelo líder', () => {
    const ranking = rankPlaces(payload.pollingPlaces, null);
    expect(ranking.map((item) => item.place.locationId)).toEqual(['p3', 'p1', 'p2']);
    expect(ranking[0].position).toBe(1);
    expect(ranking[0].share).toBe(1);
    expect(ranking[1].share).toBeCloseTo(30 / 50);
  });

  it('com zona escolhida, o ranking usa os votos daquela zona', () => {
    const ranking = rankPlaces(payload.pollingPlaces, '12');
    // Na zona 12, Castelo (10) passa à frente de Norte (8); o resto zera.
    expect(ranking.slice(0, 2).map((item) => [item.place.locationId, item.votes])).toEqual([
      ['p1', 10],
      ['p2', 8],
    ]);
  });

  it('empate mantém a mesma ordem entre leituras', () => {
    const a = place({ locationId: 'a', title: 'Zeta', total: 5, sections: [] });
    const b = place({ locationId: 'b', title: 'Alfa', total: 5, sections: [] });
    expect(rankPlaces([a, b], null).map((item) => item.place.locationId)).toEqual(['b', 'a']);
    expect(rankPlaces([b, a], null).map((item) => item.place.locationId)).toEqual(['b', 'a']);
  });

  it('não quebra com lista vazia', () => {
    expect(rankPlaces([], null)).toEqual([]);
  });
});

describe('sectionsInZone', () => {
  it('mostra todas as seções sem filtro e só as da zona com filtro', () => {
    expect(sectionsInZone(place(), null)).toHaveLength(2);
    expect(sectionsInZone(place(), '07')).toEqual(['Zona 07 · Seção 0123']);
  });
});

describe('estado do filtro', () => {
  it('conta os recortes ligados, e a visão não é recorte', () => {
    expect(activeFilterCount(DEFAULT_MAP_QUERY)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_MAP_QUERY, kind: 'RESIDENCE' })).toBe(0);
    expect(
      activeFilterCount({ ...DEFAULT_MAP_QUERY, state: 'CE', zone: '7', minVotes: 10 }),
    ).toBe(3);
  });

  it('limpar mantém a visão escolhida', () => {
    const limpo = clearFilters({ ...DEFAULT_MAP_QUERY, kind: 'POLLING_PLACE', city: 'Sobral' });
    expect(limpo).toEqual({ ...DEFAULT_MAP_QUERY, kind: 'POLLING_PLACE' });
  });
});
