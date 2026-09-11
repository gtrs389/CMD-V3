import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LocationConfigError,
  listCities,
  listDistricts,
  listDistrictsOfCity,
  listStates,
  listStreets,
} from '@/lib/server/location.service';
import {
  EMPTY_SELECTION,
  LocationError,
  citiesUrl,
  districtsPath,
  districtsUrl,
  findCity,
  parseCities,
  parseDistricts,
  parseStates,
  selectCity,
  selectDistrict,
  selectState,
  clearFrom,
  forcedManual,
  manualPlace,
  OTHER_OPTION,
  parseStreets,
  statesUrl,
  streetsPath,
  streetsUrl,
  toCityId,
  withCurrentValue,
  type CityOption,
} from '@/lib/domain/location';

/**
 * Respostas simuladas da Brasil Aberto. Nenhum teste acessa a internet.
 */
const STATES = {
  meta: { currentPage: 1, itemsPerPage: 27, totalOfItems: 27, totalOfPages: 1 },
  result: [
    { name: 'São Paulo', shortName: 'SP' },
    { name: 'Rio de Janeiro', shortName: 'RJ' },
    { name: 'Ignorado', shortName: 'XX' },
  ],
};

const CITIES = {
  meta: { currentPage: 1, itemsPerPage: 92, totalOfItems: 92, totalOfPages: 1 },
  result: [
    { id: 669, ibgeId: 3550308, name: 'São Paulo' },
    { id: 646, ibgeId: 3304557, name: 'Campinas' },
    { id: 0, ibgeId: 0, name: 'Sem identificador' },
  ],
};

const STREETS = {
  meta: { currentPage: 1, itemsPerPage: 95, totalOfItems: 95, totalOfPages: 1 },
  result: [
    { id: 1, name: 'Praça da Sé' },
    { id: 2, name: 'Rua Filipe de Oliveira' },
  ],
};

const DISTRICTS = {
  meta: { currentPage: 1, itemsPerPage: 1910, totalOfItems: 1910, totalOfPages: 1 },
  result: [
    { id: 1, name: 'Vila Mariana' },
    { id: 2, name: 'Bela Vista' },
    { id: 3, name: 'vila mariana' },
  ],
};

describe('leitura das respostas da API', () => {
  it('mantém a sigla e ordena os estados pelo nome', () => {
    const states = parseStates(STATES);

    expect(states.map((state) => state.uf)).toEqual(['RJ', 'SP']);
    expect(states[0].name).toBe('Rio de Janeiro');
  });

  it('preserva id e ibgeId de cada município', () => {
    const cities = parseCities(CITIES.result);

    expect(cities).toEqual([
      { id: 646, ibgeId: 3304557, name: 'Campinas' },
      { id: 669, ibgeId: 3550308, name: 'São Paulo' },
    ]);
  });

  it('remove bairros repetidos, guarda o id e ordena alfabeticamente', () => {
    expect(parseDistricts(DISTRICTS)).toEqual([
      { id: 2, name: 'Bela Vista' },
      { id: 1, name: 'Vila Mariana' },
    ]);
  });

  it('lê as ruas no formato { meta, result } e guarda só o nome', () => {
    expect(parseStreets(STREETS)).toEqual([
      { name: 'Praça da Sé' },
      { name: 'Rua Filipe de Oliveira' },
    ]);
    expect(parseStreets({ meta: {}, result: [] })).toEqual([]);
  });

  it('recusa resposta fora do formato esperado', () => {
    expect(() => parseStates({ result: [{ nome: 'São Paulo' }] })).toThrow(LocationError);
    expect(() => parseCities('erro interno do servidor')).toThrow(LocationError);
    expect(() => parseDistricts({ meta: {} })).toThrow(LocationError);
  });

  it('ignora registros estranhos sem perder o resto da lista', () => {
    const payload = {
      meta: {},
      result: [
        { id: 1, name: 'Sé' },
        { id: 2, name: null },
        { id: 3 },
        { id: 4, name: 'Bela Vista', extra: true },
      ],
    };

    expect(parseDistricts(payload).map((district) => district.name)).toEqual([
      'Bela Vista',
      'Sé',
    ]);
  });

  it('lista vazia de bairros não é erro', () => {
    expect(parseDistricts({ meta: {}, result: [] })).toEqual([]);
  });
});

describe('montagem das URLs', () => {
  it('usa a base fixa e envia apenas UF ou identificador', () => {
    expect(statesUrl()).toBe('https://api.brasilaberto.com/v1/states');
    expect(citiesUrl('sp')).toBe('https://api.brasilaberto.com/v1/cities/SP');
    expect(districtsUrl(669)).toBe('https://api.brasilaberto.com/v1/districts/669');
    expect(streetsUrl(2368)).toBe('https://api.brasilaberto.com/v1/streets/2368');
  });

  it('o caminho interno dos bairros leva UF e nome, nunca um identificador', () => {
    const [saoPaulo] = parseCities(CITIES).filter((city) => city.name === 'São Paulo');
    const path = districtsPath('SP', saoPaulo.name);

    expect(path).toContain('uf=SP');
    expect(path).toContain('municipio=S%C3%A3o+Paulo');
    expect(path).not.toContain(String(saoPaulo.id));
    expect(path).not.toContain(String(saoPaulo.ibgeId));
  });

  it('o caminho interno das ruas leva o id do bairro', () => {
    const [primeiro] = parseDistricts(DISTRICTS);
    expect(streetsPath(primeiro)).toContain(`/api/localidades/ruas/${primeiro.id}`);
    expect(() => streetsUrl(0)).toThrow(LocationError);
    expect(() => streetsUrl(-3)).toThrow(LocationError);
  });

  it('recusa UF fora das 27 siglas e identificador inválido', () => {
    expect(() => citiesUrl('XX')).toThrow(LocationError);
    expect(() => citiesUrl('../states')).toThrow(LocationError);
    expect(() => districtsUrl(-1)).toThrow(LocationError);
    expect(toCityId('12a')).toBeNull();
    expect(toCityId('669')).toBe(669);
  });
});

describe('encadeamento estado, município e bairro', () => {
  const cities: CityOption[] = [
    { id: 669, ibgeId: 3550308, name: 'São Paulo' },
    { id: 646, ibgeId: 3304557, name: 'Campinas' },
  ];

  const preenchido = selectDistrict(
    selectCity(selectState(EMPTY_SELECTION, 'SP'), cities[0]),
    'Vila Mariana',
  );

  it('guarda sigla, nomes e mantém o identificador fora do que é salvo', () => {
    expect(preenchido).toEqual({
      state: 'SP',
      city: 'São Paulo',
      cityId: 669,
      district: 'Vila Mariana',
    });
  });

  it('trocar o estado limpa município e bairro', () => {
    expect(selectState(preenchido, 'RJ')).toEqual({
      state: 'RJ',
      city: '',
      cityId: null,
      district: '',
    });
  });

  it('trocar o município limpa apenas o bairro', () => {
    const trocado = selectCity(preenchido, cities[1]);

    expect(trocado.state).toBe('SP');
    expect(trocado.city).toBe('Campinas');
    expect(trocado.cityId).toBe(646);
    expect(trocado.district).toBe('');
  });
});

describe('cadastros antigos', () => {
  const cities: CityOption[] = [
    { id: 669, ibgeId: 3550308, name: 'São Paulo' },
    { id: 646, ibgeId: 3304557, name: 'Campinas' },
  ];

  it('reconhece o município já salvo mesmo com acento ou caixa diferente', () => {
    expect(findCity(cities, 'sao paulo')?.id).toBe(669);
    expect(findCity(cities, 'Município Extinto')).toBeNull();
  });

  it('preserva valor antigo que a API não conhece mais', () => {
    const options = cities.map((city) => ({ value: city.name, label: city.name }));
    const preservado = withCurrentValue(options, 'Município Extinto');

    expect(preservado[0]).toEqual({
      value: 'Município Extinto',
      label: 'Município Extinto (valor atual)',
    });
    expect(withCurrentValue(options, 'Campinas')).toHaveLength(2);
  });
});

describe('consulta no servidor', () => {
  const CHAVE = 'chave-simulada-1234';

  beforeEach(() => {
    vi.stubEnv('BRASIL_ABERTO_API_KEY', CHAVE);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function stubFetch(payload: unknown) {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('envia a chave nas três consultas, sem dado pessoal junto', async () => {
    const calls: [string, RequestInit][] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push([url, init]);
        return {
          ok: true,
          json: async () =>
            url.includes('/states') ? STATES : url.includes('/cities') ? CITIES : DISTRICTS,
        };
      }),
    );

    await listStates();
    await listCities('SP');
    await listDistricts(669);

    expect(calls.map(([url]) => url)).toEqual([
      'https://api.brasilaberto.com/v1/states',
      'https://api.brasilaberto.com/v1/cities/SP',
      'https://api.brasilaberto.com/v1/districts/669',
    ]);

    for (const [, init] of calls) {
      expect(init.headers).toMatchObject({ Authorization: `Bearer ${CHAVE}` });
      expect(JSON.stringify(init)).not.toMatch(/cpf|telefone|nome/i);
    }
  });

  it('não devolve a chave junto com a lista', async () => {
    stubFetch(CITIES);

    const cities = await listCities('SP');

    expect(cities.map((city) => city.name)).toEqual(['Campinas', 'São Paulo']);
    expect(JSON.stringify(cities)).not.toContain(CHAVE);
  });

  it('sem a variável configurada, nenhuma consulta é feita', async () => {
    const fetchMock = stubFetch(STATES);
    vi.stubEnv('BRASIL_ABERTO_API_KEY', '');

    await expect(listStates()).rejects.toThrow(LocationConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('erro de configuração não mostra a chave', async () => {
    vi.stubEnv('BRASIL_ABERTO_API_KEY', '');

    const erro = await listCities('SP').catch((cause: Error) => cause);

    expect(String(erro)).not.toContain(CHAVE);
    expect((erro as Error).message).toBe('Serviço de localidades indisponível. Configuração ausente.');
  });

  it('busca os bairros pelo id interno do município, nunca pelo ibgeId', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return { ok: true, json: async () => DISTRICTS };
      }),
    );

    const [saoPaulo] = parseCities(CITIES).filter((city) => city.name === 'São Paulo');
    const districts = await listDistricts(saoPaulo.id);

    expect(calls).toEqual(['https://api.brasilaberto.com/v1/districts/669']);
    expect(calls[0]).not.toContain(String(saoPaulo.ibgeId));
    expect(districts.map((district) => district.name)).toEqual(['Bela Vista', 'Vila Mariana']);
  });

  it('resolve o id do município no servidor, a partir da UF e do nome', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return { ok: true, json: async () => (url.includes('/cities/') ? CITIES : DISTRICTS) };
      }),
    );

    const districts = await listDistrictsOfCity('SP', 'sao paulo');

    expect(calls).toEqual([
      'https://api.brasilaberto.com/v1/cities/SP',
      'https://api.brasilaberto.com/v1/districts/669',
    ]);
    expect(districts.map((district) => district.name)).toEqual(['Bela Vista', 'Vila Mariana']);
  });

  it('município desconhecido não consulta bairros e devolve lista vazia', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return { ok: true, json: async () => CITIES };
      }),
    );

    await expect(listDistrictsOfCity('SP', 'Município Extinto')).resolves.toEqual([]);
    expect(calls).toEqual(['https://api.brasilaberto.com/v1/cities/SP']);
  });

  it('consulta as ruas pelo id do bairro, com a chave no cabeçalho', async () => {
    const calls: [string, RequestInit][] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push([url, init]);
        return { ok: true, json: async () => STREETS };
      }),
    );

    const streets = await listStreets(2368);

    expect(calls[0][0]).toBe('https://api.brasilaberto.com/v1/streets/2368');
    expect(calls[0][1].headers).toMatchObject({ Authorization: `Bearer ${CHAVE}` });
    expect(streets.map((street) => street.name)).toEqual([
      'Praça da Sé',
      'Rua Filipe de Oliveira',
    ]);
    // Nenhum nome de bairro, municipio ou codigo IBGE vai na consulta.
    expect(calls[0][0]).not.toMatch(/bairro|municipio|ibge|Vila|Centro/i);
  });

  it('falha da API vira erro previsto, sem detalhe interno', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await expect(listCities('SP')).rejects.toThrow(LocationError);
  });

  it('rede indisponível também vira erro previsto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND')));

    await expect(listStates()).rejects.toThrow(LocationError);
  });
});

describe('cascata Estado, Município, Bairro e Rua', () => {
  const cheio = {
    state: 'SP',
    city: 'São Paulo',
    district: 'Bela Vista',
    street: 'Rua Filipe de Oliveira',
  };

  it('trocar o estado limpa município, bairro e rua', () => {
    expect(clearFrom(cheio, 'city')).toEqual({
      state: 'SP',
      city: '',
      district: '',
      street: '',
    });
  });

  it('trocar o município limpa bairro e rua', () => {
    expect(clearFrom(cheio, 'district')).toEqual({
      state: 'SP',
      city: 'São Paulo',
      district: '',
      street: '',
    });
  });

  it('trocar o bairro limpa apenas a rua', () => {
    expect(clearFrom(cheio, 'street')).toEqual({ ...cheio, street: '' });
  });

  it('município digitado força bairro e rua digitados', () => {
    expect(forcedManual({ city: true, district: false, street: false })).toEqual({
      city: true,
      district: true,
      street: true,
    });
  });

  it('bairro digitado força apenas a rua digitada', () => {
    expect(forcedManual({ city: false, district: true, street: false })).toEqual({
      city: false,
      district: true,
      street: true,
    });
  });

  it('rua digitada não afeta os passos anteriores', () => {
    expect(forcedManual({ city: false, district: false, street: true })).toEqual({
      city: false,
      district: false,
      street: true,
    });
  });
});

describe('opção de digitar o nome', () => {
  it('normaliza o texto digitado e nunca aceita o marcador interno', () => {
    expect(manualPlace('  Rua   das   Flores  ')).toBe('Rua das Flores');
    expect(manualPlace(OTHER_OPTION)).toBeNull();
    expect(manualPlace('')).toBeNull();
    expect(manualPlace('   ')).toBeNull();
    expect(manualPlace('a')).toBeNull();
    expect(manualPlace('x'.repeat(200))?.length).toBe(120);
  });
});
