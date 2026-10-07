import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_QUERY,
  SEM_REFERENCIA_NO_MAPA,
  activeFilterCount,
  applyMapQuery,
  chaveDaReferenciaNoMapa,
  mapOptions,
  placeOfLeaders,
} from '@/lib/domain/map-filters';
import { addToLeader, leaderKey, type MapPin, type PollingPlacePin } from '@/lib/domain/map-pin';

function comPessoas(id: string, pessoas: { lider: string | null; zona: string; secao: string }[]): PollingPlacePin {
  const pin: PollingPlacePin = {
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
  };
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
const ANA = leaderKey(null, 'Ana Souza')!;

const a = comPessoas('a', [
  { lider: 'José Carlos', zona: '1', secao: '10' },
  { lider: 'Maria Lima', zona: '1', secao: '10' },
  { lider: 'Maria Lima', zona: '1', secao: '11' },
  { lider: 'Ana Souza', zona: '1', secao: '11' },
  { lider: null, zona: '1', secao: '11' },
]);
const b = comPessoas('b', [{ lider: 'Ana Souza', zona: '2', secao: '30' }]);

// José e Maria sao do Roberval (escrito de dois jeitos); Ana nao tem referencia.
const referencias = { [JOSE]: 'ROBERVAL', [MARIA]: 'Roberval ' };
const payload = { pins: [] as MapPin[], pollingPlaces: [a, b], referencias };
const ROBERVAL = chaveDaReferenciaNoMapa('Roberval');

describe('filtro de referência no mapa', () => {
  it('lista as referencias dos Lideres, com a forma mais escrita, e "Sem referência" por ultimo', () => {
    const { references, leaders } = mapOptions(payload, null);
    expect(references).toEqual([
      { value: ROBERVAL, label: expect.stringMatching(/roberval/i), leaders: 2, people: 3 },
      { value: SEM_REFERENCIA_NO_MAPA, label: 'Sem referência', leaders: 1, people: 2 },
    ]);
    expect(leaders.find((l) => l.id === ANA)?.reference).toBeNull();
    expect(leaders.find((l) => l.id === JOSE)?.reference).toBe('ROBERVAL');
  });

  it('a escola passa a contar so a gente dos Lideres da referencia, secao a secao', () => {
    const sel = applyMapQuery(payload, { ...DEFAULT_MAP_QUERY, references: [ROBERVAL] });
    expect(sel.places.map((p) => [p.locationId, p.total])).toEqual([['a', 3]]);
    expect(sel.places[0].sections).toEqual([
      { zone: '1', section: '10', total: 2 },
      { zone: '1', section: '11', total: 1 },
    ]);
    expect(sel.votes).toBe(3);
  });

  it('"Sem referência" traz so os Lideres sem nenhuma; varias referencias somam', () => {
    const sem = applyMapQuery(payload, { ...DEFAULT_MAP_QUERY, references: [SEM_REFERENCIA_NO_MAPA] });
    expect(sem.places.map((p) => [p.locationId, p.total])).toEqual([
      ['a', 1],
      ['b', 1],
    ]);
    const todas = applyMapQuery(payload, { ...DEFAULT_MAP_QUERY, references: [ROBERVAL, SEM_REFERENCIA_NO_MAPA] });
    expect(todas.votes).toBe(5);
  });

  it('pinos de moradia ficam so com a Equipe dos Lideres da referencia', () => {
    const pino = (memberId: string, leaderId: string | null) => ({ memberId, leaderId, locationKind: 'RESIDENCE' }) as MapPin;
    const comPinos = { ...payload, pins: [pino('p1', JOSE), pino('p2', ANA), pino('p3', null)] };
    const sel = applyMapQuery(comPinos, { ...DEFAULT_MAP_QUERY, references: [ROBERVAL] });
    expect(sel.pins.map((p) => p.memberId)).toEqual(['p1']);
  });

  it('o Lider da planilha sem usuario acha a referencia pelo nome', () => {
    const porNome = { ...payload, referencias: { [leaderKey(null, 'Ana Souza')!]: 'Bete' } };
    expect(mapOptions(porNome, null).references.map((r) => r.label)).toContain('Bete');
  });

  it('conta como um filtro ligado e some no mapa geral', () => {
    expect(activeFilterCount({ ...DEFAULT_MAP_QUERY, references: [ROBERVAL] })).toBe(1);
    expect(mapOptions({ pins: [], pollingPlaces: [a, b] }, null).references).toEqual([]);
  });

  it('placeOfLeaders junta varios Lideres e some onde nenhum deles cadastrou', () => {
    expect(placeOfLeaders(b, new Set([JOSE, MARIA]))).toBeNull();
    expect(placeOfLeaders(a, new Set([JOSE, MARIA]))?.leaders?.map((l) => l.id).sort()).toEqual([JOSE, MARIA].sort());
  });
});
