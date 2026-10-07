import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_QUERY, activeFilterCount, applyMapQuery, mapOptions, placeOfLeader, rankPlaces } from '@/lib/domain/map-filters';
import { addToLeader, leaderKey, type MapPin, type PollingPlacePin } from '@/lib/domain/map-pin';

function escola(id: string, over: Partial<PollingPlacePin> = {}): PollingPlacePin {
  return {
    locationId: id,
    latitude: -9.6,
    longitude: -35.7,
    title: `Escola ${id}`,
    address: null,
    city: 'Maceió',
    state: 'AL',
    imageUrl: null,
    total: 0,
    men: 0,
    women: 0,
    others: 0,
    sections: [],
    ...over,
  };
}

/** Monta a escola como o servidor: cada pessoa no total, na secao e no Lider. */
function comPessoas(id: string, pessoas: { lider: string | null; zona: string; secao: string }[]): PollingPlacePin {
  const pin = escola(id);
  for (const p of pessoas) {
    pin.total += 1;
    pin.others += 1;
    const linha = pin.sections.find((s) => s.zone === p.zona && s.section === p.secao);
    if (linha) linha.total += 1;
    else pin.sections.push({ zone: p.zona, section: p.secao, total: 1 });
    if (p.lider) addToLeader(pin, { id: leaderKey(null, p.lider)!, name: p.lider }, 'others', p.zona, p.secao);
  }
  return pin;
}

const JOSE = leaderKey(null, 'José Carlos')!;
const MARIA = leaderKey(null, 'Maria Lima')!;

const a = comPessoas('a', [
  { lider: 'José Carlos', zona: '1', secao: '10' },
  { lider: 'José Carlos', zona: '1', secao: '10' },
  { lider: 'José Carlos', zona: '1', secao: '11' },
  { lider: 'Maria Lima', zona: '1', secao: '11' },
  { lider: null, zona: '1', secao: '11' },
]);
const b = comPessoas('b', [
  { lider: 'Maria Lima', zona: '2', secao: '30' },
  { lider: 'Maria Lima', zona: '2', secao: '30' },
]);
const c = comPessoas('c', [{ lider: 'José Carlos', zona: '2', secao: '40' }]);

describe('leaderKey', () => {
  it('usa o usuario e, sem ele, o nome sem acento nem caixa', () => {
    expect(leaderKey('u1', 'José')).toBe('u1');
    expect(leaderKey(null, 'JOSÉ  Carlos')).toBe(leaderKey(undefined, 'jose carlos'));
    expect(leaderKey(null, '  ')).toBeNull();
  });
});

describe('placeOfLeader', () => {
  it('troca total e secoes da escola pelo que o Lider cadastrou ali', () => {
    const vista = placeOfLeader(a, JOSE)!;
    expect(vista.total).toBe(3);
    expect(vista.sections).toEqual([
      { zone: '1', section: '10', total: 2 },
      { zone: '1', section: '11', total: 1 },
    ]);
  });

  it('some com a escola onde ele nao cadastrou ninguem', () => {
    expect(placeOfLeader(b, JOSE)).toBeNull();
    expect(placeOfLeader(escola('x'), JOSE)).toBeNull();
  });
});

describe('filtro de Lider no mapa', () => {
  const payload = { pins: [] as MapPin[], pollingPlaces: [a, b, c] };

  it('conta so a gente dele, escola por escola', () => {
    const sel = applyMapQuery(payload, { ...DEFAULT_MAP_QUERY, leader: JOSE });
    expect(sel.places.map((p) => [p.locationId, p.total])).toEqual([
      ['a', 3],
      ['c', 1],
    ]);
    expect(sel.votes).toBe(4);
    expect(rankPlaces(sel.places, null).map((r) => r.place.locationId)).toEqual(['a', 'c']);
  });

  it('combina com a zona: so as secoes dele naquela zona', () => {
    const sel = applyMapQuery(payload, { ...DEFAULT_MAP_QUERY, leader: JOSE, zone: '2' });
    expect(sel.places.map((p) => p.locationId)).toEqual(['c']);
    expect(sel.votes).toBe(1);
  });

  it('recorta as pessoas do mapa pelo Lider delas', () => {
    const pins = [
      { memberId: '1', leaderId: JOSE },
      { memberId: '2', leaderId: MARIA },
      { memberId: '3', leaderId: null },
    ].map(
      (p) =>
        ({
          ...p,
          memberName: 'X',
          memberPhoto: null,
          clientId: 'c',
          clientName: 'T',
          locationKind: 'RESIDENCE',
          latitude: 0,
          longitude: 0,
          place: null,
          district: null,
          city: null,
          state: null,
          zone: null,
          section: null,
          precision: 'CITY',
          phone: null,
          email: null,
        }) satisfies MapPin,
    );
    const sel = applyMapQuery({ pins, pollingPlaces: [] }, { ...DEFAULT_MAP_QUERY, leader: MARIA });
    expect(sel.pins.map((p) => p.memberId)).toEqual(['2']);
  });

  it('oferece os Lideres com quantas pessoas e escolas, em ordem de nome', () => {
    expect(mapOptions(payload, null).leaders).toEqual([
      { id: JOSE, name: 'José Carlos', people: 4, places: 2, reference: null },
      { id: MARIA, name: 'Maria Lima', people: 3, places: 2, reference: null },
    ]);
  });

  it('conta como filtro ligado', () => {
    expect(activeFilterCount({ ...DEFAULT_MAP_QUERY, leader: JOSE })).toBe(1);
  });
});
