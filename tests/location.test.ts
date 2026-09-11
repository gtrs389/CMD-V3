import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LocationConfigError,
  listCities,
  listDistricts,
  listStates,
} from '@/lib/server/location.service';
import {
  EMPTY_SELECTION,
  LocationError,
  citiesUrl,
  districtsUrl,
  findCity,
  parseCities,
  parseDistricts,
  parseStates,
  selectCity,
  selectDistrict,
  selectState,
  statesUrl,
  toCityId,
  withCurrentValue,
  type CityOption,
} from '@/lib/domain/location';

/**
 * Respostas simuladas da Brasil Aberto. Nenhum teste acessa a internet.
 */
const STATES = {
  result: [
    { id: 26, name: 'São Paulo', acronym: 'SP' },
    { id: 19, name: 'Rio de Janeiro', acronym: 'RJ' },
    { id: 41, name: 'Ignorado', acronym: 'XX' },
  ],
};

const CITIES = {
  result: [
    { id: 3550308, name: 'São Paulo' },
    { id: 3509502, name: 'Campinas' },
    { id: 0, name: 'Inválida' },
  ],
};

const DISTRICTS = {
  result: [{ name: 'Vila Mariana' }, { name: 'Bela Vista' }, { name: 'vila mariana' }],
};

describe('leitura das respostas da API', () => {
  it('mantém a sigla e ordena os estados pelo nome', () => {
    const states = parseStates(STATES);

    expect(states.map((state) => state.uf)).toEqual(['RJ', 'SP']);
    expect(states[0].name).toBe('Rio de Janeiro');
  });

  it('aceita lista sem envelope e descarta município sem identificador válido', () => {
    const cities = parseCities(CITIES.result);

    expect(cities.map((city) => city.name)).toEqual(['Campinas', 'São Paulo']);
    expect(cities.every((city) => Number.isInteger(city.id) && city.id > 0)).toBe(true);
  });

  it('remove bairros repetidos e ordena alfabeticamente', () => {
    expect(parseDistricts(DISTRICTS).map((district) => district.name)).toEqual([
      'Bela Vista',
      'Vila Mariana',
    ]);
  });

  it('recusa resposta fora do formato esperado', () => {
    expect(() => parseStates({ result: [{ nome: 'São Paulo' }] })).toThrow(LocationError);
    expect(() => parseCities('erro interno do servidor')).toThrow(LocationError);
  });
});

describe('montagem das URLs', () => {
  it('usa a base fixa e envia apenas UF ou identificador', () => {
    expect(statesUrl()).toBe('https://api.brasilaberto.com/v1/states');
    expect(citiesUrl('sp')).toBe('https://api.brasilaberto.com/v1/cities/SP');
    expect(districtsUrl(3550308)).toBe('https://api.brasilaberto.com/v1/districts/3550308');
  });

  it('recusa UF fora das 27 siglas e identificador inválido', () => {
    expect(() => citiesUrl('XX')).toThrow(LocationError);
    expect(() => citiesUrl('../states')).toThrow(LocationError);
    expect(() => districtsUrl(-1)).toThrow(LocationError);
    expect(toCityId('12a')).toBeNull();
    expect(toCityId('3550308')).toBe(3550308);
  });
});

describe('encadeamento estado, município e bairro', () => {
  const cities: CityOption[] = [
    { id: 3550308, name: 'São Paulo' },
    { id: 3509502, name: 'Campinas' },
  ];

  const preenchido = selectDistrict(
    selectCity(selectState(EMPTY_SELECTION, 'SP'), cities[0]),
    'Vila Mariana',
  );

  it('guarda sigla, nomes e mantém o identificador fora do que é salvo', () => {
    expect(preenchido).toEqual({
      state: 'SP',
      city: 'São Paulo',
      cityId: 3550308,
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
    expect(trocado.cityId).toBe(3509502);
    expect(trocado.district).toBe('');
  });
});

describe('cadastros antigos', () => {
  const cities: CityOption[] = [
    { id: 3550308, name: 'São Paulo' },
    { id: 3509502, name: 'Campinas' },
  ];

  it('reconhece o município já salvo mesmo com acento ou caixa diferente', () => {
    expect(findCity(cities, 'sao paulo')?.id).toBe(3550308);
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
    await listDistricts(3550308);

    expect(calls.map(([url]) => url)).toEqual([
      'https://api.brasilaberto.com/v1/states',
      'https://api.brasilaberto.com/v1/cities/SP',
      'https://api.brasilaberto.com/v1/districts/3550308',
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

  it('falha da API vira erro previsto, sem detalhe interno', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await expect(listCities('SP')).rejects.toThrow(LocationError);
  });

  it('rede indisponível também vira erro previsto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND')));

    await expect(listStates()).rejects.toThrow(LocationError);
  });
});
