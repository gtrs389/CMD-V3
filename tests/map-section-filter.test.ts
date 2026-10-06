import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_QUERY, activeFilterCount, applyMapQuery, mapOptions, placeOfSection } from '@/lib/domain/map-filters';
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
const a = comPessoas('a', [
  { lider: 'José Carlos', zona: '10', secao: '96' },
  { lider: 'José Carlos', zona: '10', secao: '96' },
  { lider: 'Maria Lima', zona: '10', secao: '96' },
  { lider: 'José Carlos', zona: '10', secao: '97' },
]);
// A mesma secao 96, em OUTRA zona: nao pode se misturar com a de cima.
const b = comPessoas('b', [{ lider: 'Maria Lima', zona: '2', secao: '96' }]);

describe('filtro de seção', () => {
  it('a escola passa a contar so a secao escolhida, com os Lideres dela', () => {
    const vista = placeOfSection(a, '10/96')!;
    expect(vista.total).toBe(3);
    expect(vista.sections).toEqual([{ zone: '10', section: '96', total: 3 }]);
    expect(vista.leaders?.find((l) => l.id === JOSE)?.total).toBe(2);
  });

  it('a mesma secao em outra zona nao entra', () => {
    const sel = applyMapQuery({ pins: [], pollingPlaces: [a, b] }, { ...DEFAULT_MAP_QUERY, section: '10/96' });
    expect(sel.places.map((p) => p.locationId)).toEqual(['a']);
    expect(sel.votes).toBe(3);
  });

  it('escola sem a secao some, e o Lider junto recorta as duas coisas', () => {
    expect(placeOfSection(b, '10/96')).toBeNull();
    const sel = applyMapQuery({ pins: [], pollingPlaces: [a, b] }, { ...DEFAULT_MAP_QUERY, section: '10/97', leader: JOSE });
    expect(sel.votes).toBe(1);
  });

  it('as pessoas do mapa seguem a mesma secao', () => {
    const pin = { memberId: 'm', locationKind: 'RESIDENCE', zone: '010', section: '096' } as unknown as MapPin;
    const outro = { memberId: 'n', locationKind: 'RESIDENCE', zone: '2', section: '96' } as unknown as MapPin;
    const sel = applyMapQuery({ pins: [pin, outro], pollingPlaces: [] }, { ...DEFAULT_MAP_QUERY, section: '10/96' });
    expect(sel.pins.map((p) => p.memberId)).toEqual(['m']);
  });

  it('as opcoes trazem a zona no rotulo, e so as da zona quando ela foi escolhida', () => {
    const todas = mapOptions({ pins: [], pollingPlaces: [a, b] }, null).sections;
    expect(todas.map((s) => s.label)).toEqual(['Zona 2 · Seção 96', 'Zona 10 · Seção 96', 'Zona 10 · Seção 97']);
    const daZona = mapOptions({ pins: [], pollingPlaces: [a, b] }, null, '10').sections;
    expect(daZona).toEqual([
      { value: '10/96', label: 'Seção 96', zone: '10' },
      { value: '10/97', label: 'Seção 97', zone: '10' },
    ]);
  });

  it('conta como filtro ligado', () => {
    expect(activeFilterCount({ ...DEFAULT_MAP_QUERY, section: '10/96' })).toBe(1);
  });
});
