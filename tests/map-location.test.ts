import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildQuery,
  normalizeQuery,
  parsePlace,
  pollingPlaceQuery,
  providerError,
  residenceLookup,
} from '@/lib/domain/map-location';
import {
  cellSize,
  clusterPins,
  DEFAULT_MAP_FILTER,
  filterPins,
  genderBucket,
  MAP_FILTER_LABELS,
  pinLabel,
  pollingPlaceKey,
  precisionLabel,
  type MapPin,
} from '@/lib/domain/map-pin';
import { can } from '@/lib/permissions';
import { lookupPlace, MapLookupError } from '@/lib/server/serpapi.service';

/**
 * Respostas simuladas do provedor, no formato documentado.
 * Dados ficticios: nenhum teste acessa a internet nem gasta credito.
 */
const CHAVE = 'chave-serpapi-simulada';

const ESPERADO = { city: 'São Paulo', state: 'SP' };

const UNICO = {
  search_metadata: { status: 'Success' },
  place_results: {
    title: 'Escola Municipal Exemplo',
    place_id: 'PL-1',
    data_id: 'DT-1',
    address: 'Rua das Flores, 100 - Centro, São Paulo - SP',
    country: 'Brazil',
    gps_coordinates: { latitude: -23.5505, longitude: -46.6333 },
  },
};

const LISTA = {
  search_metadata: { status: 'Success' },
  local_results: [
    {
      position: 1,
      title: 'Sem coordenada',
      address: 'Rua A, São Paulo - SP',
      country: 'Brazil',
      gps_coordinates: { latitude: null, longitude: null },
    },
    {
      position: 2,
      title: 'Escola Estadual Exemplo',
      place_id: 'PL-2',
      data_id: 'DT-2',
      address: 'Avenida B, 200 - Bela Vista, São Paulo - SP',
      country: 'Brazil',
      gps_coordinates: { latitude: -23.56, longitude: -46.64 },
    },
  ],
};

describe('montagem da consulta', () => {
  it('moradia usa apenas rua, bairro, município e UF', () => {
    const lookup = residenceLookup({
      street: 'Rua das Flores',
      district: 'Centro',
      city: 'São Paulo',
      state: 'SP',
    });
    const query = lookup?.query;

    expect(query).toBe('Rua das Flores, Centro, São Paulo - SP, Brasil');
    expect(lookup?.precision).toBe('STREET');

    // Nenhum dado da pessoa entra na consulta.
    expect(query).not.toMatch(/\d{11}|cpf|telefone|nascimento|mae|titulo|zona|secao/i);
  });

  it('local de votação usa o domicílio eleitoral', () => {
    expect(
      pollingPlaceQuery({
        local: 'ESCOLA MUNICIPAL EXEMPLO',
        logradouro: 'RUA DAS FLORES S/N',
        bairro: 'CENTRO',
        municipio: 'SÃO PAULO',
        uf: 'SP',
      }),
    ).toBe('ESCOLA MUNICIPAL EXEMPLO, RUA DAS FLORES S/N, CENTRO, SÃO PAULO - SP, Brasil');
  });

  it('sem município, UF ou endereço não há consulta', () => {
    expect(residenceLookup({ street: 'Rua A', district: 'Centro', city: '', state: 'SP' })).toBeNull();
    expect(residenceLookup({ street: 'Rua A', city: 'São Paulo', state: '' })).toBeNull();
    expect(pollingPlaceQuery({ local: '', municipio: 'São Paulo', uf: 'SP' })).toBeNull();
    expect(buildQuery({ city: 'São Paulo', state: 'SP' })).toBeNull();
  });

  it('sem rua usa o bairro; sem rua e bairro, o município', () => {
    expect(residenceLookup({ district: 'Centro', city: 'São Paulo', state: 'SP' })).toEqual({
      query: 'Centro, São Paulo - SP, Brasil',
      precision: 'DISTRICT',
    });

    expect(residenceLookup({ city: 'São Paulo', state: 'SP' })).toEqual({
      query: 'São Paulo - SP, Brasil',
      precision: 'CITY',
    });
  });

  it('a mesma consulta normaliza para o mesmo texto (cache por hash)', () => {
    expect(normalizeQuery('  Rua  das   FLORES, Centro, São Paulo - SP, Brasil ')).toBe(
      normalizeQuery('Rua das Flores, Centro, Sao Paulo - SP, Brasil'),
    );
  });
});

describe('leitura da resposta', () => {
  it('prefere place_results', () => {
    const place = parsePlace({ ...UNICO, local_results: LISTA.local_results }, ESPERADO);

    expect(place).toEqual({
      latitude: -23.5505,
      longitude: -46.6333,
      title: 'Escola Municipal Exemplo',
      address: 'Rua das Flores, 100 - Centro, São Paulo - SP',
      placeId: 'PL-1',
      dataId: 'DT-1',
      imageUrl: null,
    });
  });

  it('guarda a miniatura, com prioridade para serpapi_thumbnail', () => {
    const comAmbas = parsePlace(
      {
        place_results: {
          ...UNICO.place_results,
          serpapi_thumbnail: 'https://serpapi.example/escola.jpg',
          thumbnail: 'https://outra.example/escola.jpg',
        },
      },
      ESPERADO,
    );
    expect(comAmbas?.imageUrl).toBe('https://serpapi.example/escola.jpg');

    const soThumb = parsePlace(
      { place_results: { ...UNICO.place_results, thumbnail: 'https://outra.example/e.jpg' } },
      ESPERADO,
    );
    expect(soThumb?.imageUrl).toBe('https://outra.example/e.jpg');

    // Sem imagem ou fora de HTTPS: nulo, para a tela usar o fallback.
    expect(parsePlace(UNICO, ESPERADO)?.imageUrl).toBeNull();
    expect(
      parsePlace(
        { place_results: { ...UNICO.place_results, thumbnail: 'http://inseguro.example/e.jpg' } },
        ESPERADO,
      )?.imageUrl,
    ).toBeNull();
  });

  it('cai para o primeiro item válido de local_results', () => {
    const place = parsePlace(LISTA, ESPERADO);

    expect(place?.placeId).toBe('PL-2');
    expect(place?.latitude).toBe(-23.56);
  });

  it('recusa coordenada ausente, inválida ou fora do intervalo', () => {
    const invalidos = [
      { place_results: { gps_coordinates: { latitude: 'abc', longitude: -46 } } },
      { place_results: { gps_coordinates: { latitude: 95, longitude: -46 } } },
      { place_results: { gps_coordinates: { latitude: -23, longitude: 200 } } },
      { place_results: { title: 'Sem coordenada' } },
      { local_results: [] },
      null,
    ];

    for (const payload of invalidos) expect(parsePlace(payload, ESPERADO)).toBeNull();
  });

  it('recusa resultado de outro país e de outra cidade', () => {
    expect(
      parsePlace(
        {
          place_results: {
            address: 'Some Street, New York - NY',
            country: 'United States',
            gps_coordinates: { latitude: 40.7455, longitude: -74.0083 },
          },
        },
        ESPERADO,
      ),
    ).toBeNull();

    expect(
      parsePlace(
        {
          place_results: {
            address: 'Rua X, Campinas - SP',
            country: 'Brazil',
            gps_coordinates: { latitude: -22.9, longitude: -47.06 },
          },
        },
        ESPERADO,
      ),
    ).toBeNull();
  });

  it('reconhece o erro declarado pelo provedor', () => {
    expect(providerError({ error: 'Google Maps hasn’t returned any results' })).toBe(true);
    expect(providerError({ search_metadata: { status: 'Error' } })).toBe(true);
    expect(providerError(UNICO)).toBe(false);
  });
});

describe('chamada ao provedor', () => {
  beforeEach(() => vi.stubEnv('SERPAPI_API_KEY', CHAVE));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function stub(handler: () => unknown) {
    const calls: [string, RequestInit][] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push([url, init]);
        return handler();
      }),
    );
    return calls;
  }

  it('monta a URL com os parâmetros exigidos e sem "ll"', async () => {
    const calls = stub(() => ({ ok: true, json: async () => UNICO }));

    await lookupPlace('Rua das Flores, Centro, São Paulo - SP, Brasil', ESPERADO);

    const url = new URL(calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://serpapi.com/search.json');
    expect(url.searchParams.get('engine')).toBe('google_maps');
    expect(url.searchParams.get('type')).toBe('search');
    expect(url.searchParams.get('google_domain')).toBe('google.com.br');
    expect(url.searchParams.get('gl')).toBe('br');
    expect(url.searchParams.get('hl')).toBe('pt-br');
    expect(url.searchParams.get('q')).toBe('Rua das Flores, Centro, São Paulo - SP, Brasil');
    expect(url.searchParams.get('api_key')).toBe(CHAVE);

    // Nem o parametro de referencia, nem o desligamento do cache do provedor.
    expect(url.searchParams.has('ll')).toBe(false);
    expect(calls[0][0]).not.toContain('40.7455096');
    expect(url.searchParams.has('no_cache')).toBe(false);
  });

  it('traduz os códigos HTTP em erros seguros', async () => {
    for (const [status, code] of [
      [400, 'BAD_REQUEST'],
      [401, 'INVALID_KEY'],
      [403, 'NO_ACCESS'],
      [429, 'RATE_LIMITED'],
      [500, 'PROVIDER_UNAVAILABLE'],
      [503, 'PROVIDER_UNAVAILABLE'],
    ] as const) {
      stub(() => ({ ok: false, status, json: async () => ({ detalhe: 'interno' }) }));
      const erro = await lookupPlace('Rua A, São Paulo - SP, Brasil', ESPERADO).catch(
        (cause: MapLookupError) => cause,
      );

      expect((erro as MapLookupError).code).toBe(code);
      expect(String(erro)).not.toContain(CHAVE);
      expect(String(erro)).not.toContain('interno');
    }
  });

  it('sem a variável, nenhuma consulta é feita', async () => {
    const calls = stub(() => ({ ok: true, json: async () => UNICO }));
    vi.stubEnv('SERPAPI_API_KEY', '');

    const erro = await lookupPlace('Rua A, São Paulo - SP, Brasil', ESPERADO).catch(
      (cause: MapLookupError) => cause,
    );

    expect((erro as MapLookupError).code).toBe('MISSING_CONFIG');
    expect(calls).toHaveLength(0);
  });
});

describe('pinos do mapa', () => {
  const base: MapPin = {
    memberId: 'm1',
    memberName: 'Ana Souza',
    memberPhoto: null,
    clientId: 'c1',
    clientName: 'Comitê Exemplo',
    locationKind: 'RESIDENCE',
    latitude: -23.55,
    longitude: -46.63,
    place: 'Rua das Flores',
    district: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    zone: null,
    section: null,
    precision: 'STREET',
    phone: '11999999999',
    email: null,
  };

  const votacao: MapPin = {
    ...base,
    locationKind: 'POLLING_PLACE',
    place: 'Escola Municipal Exemplo',
    zone: '005',
    section: '0123',
  };

  it('os filtros são Pessoas, Locais de votação e Ambos', () => {
    expect(MAP_FILTER_LABELS.RESIDENCE).toBe('Pessoas');
    expect(MAP_FILTER_LABELS.POLLING_PLACE).toBe('Locais de votação');
    expect(MAP_FILTER_LABELS.BOTH).toBe('Ambos');
  });

  it('o filtro começa em Ambos e separa os tipos', () => {
    expect(DEFAULT_MAP_FILTER).toBe('BOTH');
    expect(filterPins([base, votacao], DEFAULT_MAP_FILTER)).toHaveLength(2);
    expect(filterPins([base, votacao], 'RESIDENCE')).toEqual([base]);
    expect(filterPins([base, votacao], 'POLLING_PLACE')).toEqual([votacao]);
    expect(filterPins([base, votacao], 'BOTH')).toHaveLength(2);
  });

  it('o mesmo integrante tem dois pinos distintos', () => {
    const ambos = filterPins([base, votacao], 'BOTH');

    expect(ambos.map((pin) => pin.locationKind)).toEqual(['RESIDENCE', 'POLLING_PLACE']);
    expect(new Set(ambos.map((pin) => pin.memberId)).size).toBe(1);
    expect(pinLabel(base)).toBe('Rua das Flores');
    expect(pinLabel(votacao)).toBe('Escola Municipal Exemplo');
  });

  it('agrupa pontos próximos preservando a contagem individual', () => {
    const vizinho = { ...base, memberId: 'm2', memberName: 'Bia Lima', longitude: -46.6301 };
    const distante = { ...base, memberId: 'm3', latitude: -12.97, longitude: -38.5 };

    const agrupado = clusterPins([base, vizinho, distante], 5);
    expect(agrupado).toHaveLength(2);
    expect(agrupado.reduce((total, group) => total + group.pins.length, 0)).toBe(3);

    // Em zoom alto cada pessoa aparece sozinha.
    expect(clusterPins([base, vizinho, distante], 18)).toHaveLength(3);
    expect(cellSize(18)).toBeLessThan(cellSize(5));
  });

  it('moradia e local de votação nunca caem no mesmo grupo', () => {
    const grupos = clusterPins([base, { ...votacao, memberId: 'm9' }], 5);
    expect(grupos).toHaveLength(2);
  });
});

describe('acesso ao mapa', () => {
  it('somente o ADMIN vê ou localiza', () => {
    expect(can({ role: 'ADMIN' }, 'map.view')).toBe(true);
    expect(can({ role: 'ADMIN' }, 'map.resolve')).toBe(true);
    expect(can({ role: 'EQUIPE' }, 'map.view')).toBe(false);
    expect(can({ role: 'EQUIPE' }, 'map.resolve')).toBe(false);
    expect(can(null, 'map.view')).toBe(false);
  });
});

describe('aviso de precisão no popup', () => {
  const pin = {
    memberId: 'm1',
    memberName: 'Ana Souza',
    memberPhoto: null,
    clientId: 'c1',
    clientName: 'Comitê Exemplo',
    locationKind: 'RESIDENCE' as const,
    latitude: -23.55,
    longitude: -46.63,
    place: 'Rua das Flores',
    district: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    zone: null,
    section: null,
    precision: 'STREET' as const,
    phone: null,
    email: null,
  };

  it('diz rua, bairro ou município conforme a precisão', () => {
    expect(precisionLabel(pin)).toBe('Localização cadastrada aproximada da rua');
    expect(precisionLabel({ ...pin, precision: 'DISTRICT' })).toBe(
      'Localização cadastrada aproximada do bairro',
    );
    expect(precisionLabel({ ...pin, precision: 'CITY' })).toBe(
      'Localização cadastrada aproximada do município',
    );
  });
});

describe('agrupamento do local de votação', () => {
  const coord = { latitude: -23.5505, longitude: -46.6333, title: 'Escola Municipal Exemplo' };

  it('usa place_id, depois data_id, depois coordenada e título', () => {
    expect(pollingPlaceKey({ ...coord, placeId: 'PL-1', dataId: 'DT-1' })).toBe('place:PL-1');
    expect(pollingPlaceKey({ ...coord, placeId: null, dataId: 'DT-1' })).toBe('data:DT-1');

    const porCoordenada = pollingPlaceKey({ ...coord, placeId: null, dataId: null });
    expect(porCoordenada).toBe(
      pollingPlaceKey({ ...coord, title: '  escola   municipal  exemplo ', placeId: '', dataId: '' }),
    );
    expect(porCoordenada).not.toBe(
      pollingPlaceKey({ ...coord, latitude: -22.9, placeId: null, dataId: null }),
    );
  });

  it('o gênero contado é o declarado, e o resto fecha o total', () => {
    expect(genderBucket('HOMEM')).toBe('men');
    expect(genderBucket('MULHER')).toBe('women');
    expect(genderBucket('OUTRO')).toBe('others');
    expect(genderBucket('NAO_INFORMAR')).toBe('others');
    expect(genderBucket(null)).toBe('others');
  });
});
