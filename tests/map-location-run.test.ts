import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapLocationRow, MemberLocationRow, PollingPlaceRow } from '@/lib/supabase/tables';

/**
 * Resolucao das coordenadas com banco e provedor simulados.
 *
 * O objetivo e provar que o cache evita consultas repetidas (cada uma e
 * cobrada), que moradia e local de votacao vivem separados e que a ESCOLA
 * nao chega mais a provedor nenhum: desde a migration 042 ela sai da nossa
 * tabela, achada por UF + zona + secao.
 */

const ESCOLA = {
  latitude: -23.5505,
  longitude: -46.6333,
  title: 'Escola Municipal Exemplo',
  address: 'Rua das Flores, 100 - Centro, São Paulo - SP',
  placeId: 'PL-1',
  dataId: 'DT-1',
};

interface DB {
  members: Record<string, Record<string, unknown>>;
  verifications: Record<string, Record<string, unknown>>;
  links: MemberLocationRow[];
  places: MapLocationRow[];
  /** Locais de votacao do TSE, a nossa tabela (migration 042). */
  pollingPlaces: PollingPlaceRow[];
}

const db: DB = { members: {}, verifications: {}, links: [], places: [], pollingPlaces: [] };

/**
 * "Conferir CPF e título de eleitor" deste time.
 *
 * Desligada, ela tambem desliga a moradia aproximada: e a unica consulta
 * paga que sobrou, e um time que optou por nao consultar fornecedor nenhum
 * nao pode continuar gastando por outra porta.
 */
const conferencia = { ligada: true };

/** Uma linha da planilha do TSE, do jeito que ela chega ao banco. */
const LOCAL_DO_TSE: PollingPlaceRow = {
  id: 'pp-1',
  uf: 'SP',
  city_code: 71072,
  city: 'São Paulo',
  zone: 5,
  name: 'ESCOLA MUNICIPAL EXEMPLO',
  place_type: 'Convencional',
  address: 'RUA DAS FLORES S/N',
  district: 'CENTRO',
  postal_code: '01000000',
  latitude: -23.5505,
  longitude: -46.6333,
  section_count: 2,
  sections: [123, 124],
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
};

/**
 * Filtro no formato do PostgREST.
 *
 * O banco real recusa filtro sem operador (`client_id=cli-1` em vez de
 * `client_id=eq.cli-1`), entao aqui isso falha na hora: valor sem operador
 * conhecido nao passa silenciosamente.
 */
const OPERATORS = [
  'eq.',
  'in.',
  'is.',
  'neq.',
  'gt.',
  'gte.',
  'lt.',
  'lte.',
  'like.',
  'ilike.',
  'cs.',
];

function match(row: Record<string, unknown>, filters: Record<string, string>): boolean {
  return Object.entries(filters).every(([key, value]) => {
    if (key === 'or') return true;
    if (value === 'is.null') return row[key] === null || row[key] === undefined;
    if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
    if (value.startsWith('in.')) {
      return value.slice(4, -1).split(',').includes(String(row[key]));
    }
    // `cs.{16}`: a lista da linha contem aquele numero. E como a secao acha
    // o local no banco de verdade.
    if (value.startsWith('cs.{')) {
      const procurado = Number(value.slice(4, -1));
      const lista = row[key];
      return Array.isArray(lista) && lista.includes(procurado);
    }
    if (!OPERATORS.some((operator) => value.startsWith(operator))) {
      throw new Error(`Filtro sem operador do PostgREST: ${key}=${value}`);
    }
    return true;
  });
}

vi.mock('@/lib/supabase/rest', () => ({
  selectOne: async (table: string, options: { filters?: Record<string, string> }) => {
    const filters = options.filters ?? {};
    if (table === 'cmd_members') return db.members[String(filters.id).slice(3)] ?? null;
    if (table === 'cmd_member_verifications') {
      return db.verifications[String(filters.member_id).slice(3)] ?? null;
    }
    if (table === 'cmd_member_locations') {
      return db.links.find((row) => match(row as unknown as Record<string, unknown>, filters)) ?? null;
    }
    if (table === 'cmd_map_locations') {
      return db.places.find((row) => match(row as unknown as Record<string, unknown>, filters)) ?? null;
    }
    if (table === 'cmd_polling_places') {
      return (
        db.pollingPlaces.find((row) => match(row as unknown as Record<string, unknown>, filters)) ??
        null
      );
    }
    // O time deste cenario informa o estado (migration 038): e ele que
    // recorta a busca do local, porque numero de zona se repete entre UFs.
    if (table === 'cmd_clients') {
      return { id: 'cli-1', state_uf: 'SP', verification_enabled: conferencia.ligada };
    }
    return null;
  },
  selectRows: async (table: string, options: { filters?: Record<string, string> }) => {
    const filters = options.filters ?? {};
    if (table === 'cmd_member_locations') {
      return db.links.filter((row) => match(row as unknown as Record<string, unknown>, filters));
    }
    if (table === 'cmd_map_locations') return db.places;
    if (table === 'cmd_members') {
      return Object.values(db.members).filter((row) => match(row, filters));
    }
    if (table === 'cmd_clients') {
      // O mapa geral pergunta antes quais times sao DEMO, para deixa-los de
      // fora. O time deste cenario e real: a pergunta volta vazia, e a
      // consulta segue sem nenhum recorte.
      if (filters.is_demo === 'is.true') return [];
      return [
        {
          id: 'cli-1',
          name: 'Comitê Exemplo',
          is_demo: false,
          verification_enabled: conferencia.ligada,
        },
      ];
    }
    if (table === 'cmd_member_verifications') {
      return Object.values(db.verifications);
    }
    return [];
  },
  insertOne: async (table: string, value: Record<string, unknown>) => {
    if (table === 'cmd_member_locations') {
      const row = {
        id: `link-${db.links.length + 1}`,
        attempts: 0,
        query_hash: null,
        location_id: null,
        error_code: null,
        requested_at: null,
        resolved_at: null,
        locked_at: null,
        lock_token: null,
        ...value,
      } as MemberLocationRow;
      db.links.push(row);
      return row;
    }
    if (table === 'cmd_map_locations') {
      // Unicidade do hash: uma consulta, um lugar.
      const existing = db.places.find((row) => row.query_hash === value.query_hash);
      if (existing) throw new Error('duplicado');
      const row = { id: `place-${db.places.length + 1}`, ...value } as MapLocationRow;
      db.places.push(row);
      return row;
    }
    return { id: 'x' };
  },
  updateRows: async (
    table: string,
    filters: Record<string, string>,
    values: Record<string, unknown>,
  ) => {
    if (table !== 'cmd_member_locations') return [];

    const alvo = db.links.filter((row) => match(row as unknown as Record<string, unknown>, filters));
    const livre = filters.or?.includes('lock_token.is.null');

    const alterados = alvo
      .filter((row) => !livre || !row.lock_token)
      .map((row) => Object.assign(row, values) as MemberLocationRow);

    return alterados;
  },
  deleteRows: async () => [],
  inFilter: (values: string[]) => `in.(${values.join(',')})`,
}));

const lookupPlace = vi.fn();

vi.mock('@/lib/server/serpapi.service', () => {
  class MapLookupError extends Error {
    readonly code: string;
    constructor(code: string) {
      super(code);
      this.name = 'MapLookupError';
      this.code = code;
    }
  }
  return { MapLookupError, lookupPlace: (...args: unknown[]) => lookupPlace(...args) };
});

vi.mock('@/lib/supabase/storage', () => ({ signedUrls: async (paths: unknown[]) => paths.map(() => null) }));

const {
  createPendingLocation,
  mapOverview,
  placeMembers,
  ensureResidenceLinks,
  invalidateLocation,
  queryHash,
  resolveLocation,
  resolvePending,
} = await import('@/lib/server/map-location.service');

const { encryptJson } = await import('@/lib/server/crypto');
const { estimatedVotes } = await import('@/lib/domain/map-pin');

function member(id: string, extra: Record<string, unknown> = {}) {
  db.members[id] = {
    id,
    client_id: 'cli-1',
    name: `Pessoa ${id}`,
    street: 'Rua das Flores',
    district: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    photo_path: null,
    ...extra,
  };
}

beforeEach(() => {
  vi.stubEnv('MEMBER_VERIFICATION_ENCRYPTION_KEY', Buffer.alloc(32, 5).toString('base64'));
  vi.stubEnv('SERPAPI_API_KEY', 'chave-simulada');
  lookupPlace.mockReset().mockResolvedValue(ESCOLA);
  db.members = {};
  db.verifications = {};
  db.links = [];
  db.places = [];
  db.pollingPlaces = [LOCAL_DO_TSE];
  conferencia.ligada = true;
});

describe('time com a confirmação de dados desligada', () => {
  beforeEach(() => {
    conferencia.ligada = false;
  });

  it('não cria o vínculo de moradia: não há consulta esperando acontecer', async () => {
    member('m1');
    await createPendingLocation('cli-1', 'm1', 'RESIDENCE');

    expect(db.links).toHaveLength(0);
    expect(lookupPlace).not.toHaveBeenCalled();
  });

  it('não consulta o provedor por um vínculo criado antes de desligar', async () => {
    member('m1');
    conferencia.ligada = true;
    await createPendingLocation('cli-1', 'm1', 'RESIDENCE');
    conferencia.ligada = false;

    await resolveLocation('m1', 'RESIDENCE');

    expect(lookupPlace).not.toHaveBeenCalled();
    expect(db.links[0].status).toBe('PENDING');
  });

  it('a fila de pendentes também não gasta', async () => {
    member('m1');
    conferencia.ligada = true;
    await createPendingLocation('cli-1', 'm1', 'RESIDENCE');
    conferencia.ligada = false;

    await resolvePending();

    expect(lookupPlace).not.toHaveBeenCalled();
  });

  it('o local de votação continua: ele sai da nossa tabela, sem cobrança', async () => {
    member('m1', { zone: '5', section: '123' });
    await createPendingLocation('cli-1', 'm1', 'POLLING_PLACE');
    await resolveLocation('m1', 'POLLING_PLACE');

    expect(lookupPlace).not.toHaveBeenCalled();
    expect(db.links[0].status).toBe('SUCCESS');
  });

  it('a varredura de vínculos que faltam pula o time inteiro', async () => {
    member('m1');
    member('m2');

    await ensureResidenceLinks();

    expect(db.links).toHaveLength(0);
  });
});

describe('resolução das coordenadas', () => {
  it('consulta uma vez e guarda o lugar', async () => {
    member('m1');
    await createPendingLocation('cli-1', 'm1', 'RESIDENCE');
    await resolveLocation('m1', 'RESIDENCE');

    expect(lookupPlace).toHaveBeenCalledTimes(1);
    expect(lookupPlace.mock.calls[0][0]).toBe('Rua das Flores, Centro, São Paulo - SP, Brasil');

    const link = db.links[0];
    expect(link.status).toBe('SUCCESS');
    expect(link.location_id).toBe('place-1');
    expect(link.lock_token).toBeNull();
    expect(db.places[0].query_hash).toBe(queryHash('Rua das Flores, Centro, São Paulo - SP, Brasil'));
  });

  it('mesma rua de outro integrante reutiliza o cache, sem nova consulta', async () => {
    member('m1');
    member('m2');
    member('m3');

    for (const id of ['m1', 'm2', 'm3']) {
      await createPendingLocation('cli-1', id, 'RESIDENCE');
      await resolveLocation(id, 'RESIDENCE');
    }

    expect(lookupPlace).toHaveBeenCalledTimes(1);
    expect(db.places).toHaveLength(1);
    expect(db.links.every((link) => link.location_id === 'place-1')).toBe(true);
  });

  it('não repete sozinha depois de resolver', async () => {
    member('m1');
    await createPendingLocation('cli-1', 'm1', 'RESIDENCE');
    await resolveLocation('m1', 'RESIDENCE');
    await resolveLocation('m1', 'RESIDENCE');

    expect(lookupPlace).toHaveBeenCalledTimes(1);
  });

  it('sem resultado confiável marca NOT_FOUND, sem inventar coordenada', async () => {
    lookupPlace.mockResolvedValue(null);
    member('m1');
    await createPendingLocation('cli-1', 'm1', 'RESIDENCE');
    await resolveLocation('m1', 'RESIDENCE');

    expect(db.links[0].status).toBe('NOT_FOUND');
    expect(db.links[0].location_id).toBeNull();
    expect(db.places).toHaveLength(0);
  });

  it('falha do provedor guarda apenas o código seguro e não repete', async () => {
    const { MapLookupError } = await import('@/lib/server/serpapi.service');
    lookupPlace.mockRejectedValue(new MapLookupError('RATE_LIMITED'));
    member('m1');
    await createPendingLocation('cli-1', 'm1', 'RESIDENCE');
    await resolveLocation('m1', 'RESIDENCE');
    await resolveLocation('m1', 'RESIDENCE');

    expect(db.links[0].status).toBe('FAILED');
    expect(db.links[0].error_code).toBe('RATE_LIMITED');
    expect(lookupPlace).toHaveBeenCalledTimes(2); // segunda so pelo estado FAILED
  });

  it('sem município e UF nada é consultado', async () => {
    member('m1', { street: null, district: null, city: null, state: null });
    await createPendingLocation('cli-1', 'm1', 'RESIDENCE');
    await resolveLocation('m1', 'RESIDENCE');

    expect(lookupPlace).not.toHaveBeenCalled();
    expect(db.links[0].status).toBe('NOT_FOUND');
  });
});

describe('os dois tipos convivem', () => {
  beforeEach(() => {
    member('m1');
    db.verifications.m1 = {
      member_id: 'm1',
      tse_status: 'SUCCESS',
      tse_payload: encryptJson({
        local: 'ESCOLA MUNICIPAL EXEMPLO',
        logradouro: 'RUA DAS FLORES S/N',
        bairro: 'CENTRO',
        municipio: 'São Paulo',
        uf: 'SP',
        zona: '005',
        secao: '0123',
      }),
    };
  });

  it('o mesmo integrante tem moradia e local de votação separados', async () => {
    await createPendingLocation('cli-1', 'm1', 'RESIDENCE');
    await createPendingLocation('cli-1', 'm1', 'POLLING_PLACE');
    await resolveLocation('m1', 'RESIDENCE');
    await resolveLocation('m1', 'POLLING_PLACE');

    expect(db.links).toHaveLength(2);
    expect(db.links.map((link) => link.location_kind).sort()).toEqual([
      'POLLING_PLACE',
      'RESIDENCE',
    ]);
    // UMA consulta paga, e so a da moradia: a escola veio da nossa tabela.
    expect(lookupPlace).toHaveBeenCalledTimes(1);
    expect(lookupPlace.mock.calls[0][0]).toBe('Rua das Flores, Centro, São Paulo - SP, Brasil');

    const votacao = db.links.find((link) => link.location_kind === 'POLLING_PLACE');
    const escola = db.places.find((place) => place.id === votacao?.location_id);
    expect(votacao?.status).toBe('SUCCESS');
    expect(escola?.provider).toBe('CMD_LOCAIS_DE_VOTACAO');
    expect(escola?.title).toBe('ESCOLA MUNICIPAL EXEMPLO');
    expect(escola?.latitude).toBe(LOCAL_DO_TSE.latitude);

    // Nenhum dado da pessoa vai junto da consulta que sobrou.
    for (const [query] of lookupPlace.mock.calls) {
      expect(query).not.toMatch(/Pessoa|cpf|telefone|zona|secao|005|0123/i);
    }
  });

  it('a escola nunca vira consulta paga: sem a tabela, fica não encontrada', async () => {
    // UF ainda nao importada, secao nova ou numero digitado errado: o local
    // simplesmente nao existe para nos. Nada e perguntado a provedor nenhum.
    db.pollingPlaces = [];

    await createPendingLocation('cli-1', 'm1', 'POLLING_PLACE');
    await resolveLocation('m1', 'POLLING_PLACE');

    expect(lookupPlace).not.toHaveBeenCalled();
    expect(db.links[0].status).toBe('NOT_FOUND');
    expect(db.links[0].location_id).toBeNull();
  });

  it('local sem coordenada na planilha não vira pino', async () => {
    db.pollingPlaces = [{ ...LOCAL_DO_TSE, latitude: null, longitude: null }];

    await createPendingLocation('cli-1', 'm1', 'POLLING_PLACE');
    await resolveLocation('m1', 'POLLING_PLACE');

    expect(lookupPlace).not.toHaveBeenCalled();
    expect(db.links[0].status).toBe('NOT_FOUND');
  });

  it('a mesma escola de três pessoas é uma linha só no cache', async () => {
    member('m2');
    member('m3');
    db.verifications.m2 = db.verifications.m1;
    db.verifications.m3 = db.verifications.m1;

    for (const id of ['m1', 'm2', 'm3']) {
      await createPendingLocation('cli-1', id, 'POLLING_PLACE');
      await resolveLocation(id, 'POLLING_PLACE');
    }

    expect(db.places).toHaveLength(1);
    const ids = new Set(db.links.map((link) => link.location_id));
    expect(ids.size).toBe(1);
  });

  it('um pedido por integrante e tipo: criar de novo não duplica', async () => {
    await createPendingLocation('cli-1', 'm1', 'RESIDENCE');
    await createPendingLocation('cli-1', 'm1', 'RESIDENCE');
    await createPendingLocation('cli-1', 'm1', 'POLLING_PLACE');

    expect(db.links).toHaveLength(2);
  });

  it('mudar o endereço invalida só a moradia', async () => {
    await createPendingLocation('cli-1', 'm1', 'RESIDENCE');
    await createPendingLocation('cli-1', 'm1', 'POLLING_PLACE');
    await resolveLocation('m1', 'RESIDENCE');
    await resolveLocation('m1', 'POLLING_PLACE');

    await invalidateLocation('cli-1', 'm1', 'RESIDENCE');

    const moradia = db.links.find((link) => link.location_kind === 'RESIDENCE');
    const votacao = db.links.find((link) => link.location_kind === 'POLLING_PLACE');

    expect(moradia?.status).toBe('PENDING');
    expect(moradia?.location_id).toBeNull();
    expect(votacao?.status).toBe('SUCCESS');
    expect(votacao?.location_id).toBeTruthy();
  });

  it('nova consulta eleitoral invalida só o local de votação', async () => {
    await createPendingLocation('cli-1', 'm1', 'RESIDENCE');
    await createPendingLocation('cli-1', 'm1', 'POLLING_PLACE');
    await resolveLocation('m1', 'RESIDENCE');
    await resolveLocation('m1', 'POLLING_PLACE');

    await invalidateLocation('cli-1', 'm1', 'POLLING_PLACE');

    expect(db.links.find((link) => link.location_kind === 'RESIDENCE')?.status).toBe('SUCCESS');
    expect(db.links.find((link) => link.location_kind === 'POLLING_PLACE')?.status).toBe('PENDING');
  });
});

describe('cadastros antigos sem rua', () => {
  it('localiza pelo bairro quando não há rua', async () => {
    member('m1', { street: null });
    await createPendingLocation('cli-1', 'm1', 'RESIDENCE');
    await resolveLocation('m1', 'RESIDENCE');

    expect(lookupPlace).toHaveBeenCalledTimes(1);
    expect(lookupPlace.mock.calls[0][0]).toBe('Centro, São Paulo - SP, Brasil');
    expect(db.links[0].status).toBe('SUCCESS');
    expect(db.links[0].location_precision).toBe('DISTRICT');
  });

  it('localiza pelo município quando só há município e UF', async () => {
    member('m1', { street: null, district: null });
    await createPendingLocation('cli-1', 'm1', 'RESIDENCE');
    await resolveLocation('m1', 'RESIDENCE');

    expect(lookupPlace.mock.calls[0][0]).toBe('São Paulo - SP, Brasil');
    expect(db.links[0].location_precision).toBe('CITY');
  });

  it('garante o vínculo de quem tem município e UF, sem duplicar', async () => {
    member('m1', { street: null, district: null });
    member('m2');
    member('m3', { city: null, state: null });

    await ensureResidenceLinks();
    await ensureResidenceLinks();

    expect(db.links).toHaveLength(2);
    expect(db.links.map((link) => link.member_id).sort()).toEqual(['m1', 'm2']);
    expect(lookupPlace).not.toHaveBeenCalled();
  });
});

describe('localizar pendentes', () => {
  it('processa um de cada vez e reaproveita o cache entre eles', async () => {
    member('m1');
    member('m2', { street: 'Rua das Flores' });
    member('m3', { street: 'Avenida Central' });

    for (const id of ['m1', 'm2', 'm3']) {
      await createPendingLocation('cli-1', id, 'RESIDENCE');
    }

    const { processed } = await resolvePending();

    expect(processed).toBe(3);
    // Duas ruas distintas: duas consultas, nao tres.
    expect(lookupPlace).toHaveBeenCalledTimes(2);
    expect(db.links.every((link) => link.status === 'SUCCESS')).toBe(true);
  });
});

describe('mapa agrupado por local de votação', () => {
  /** Tres pessoas do mesmo local, com generos e telefones diferentes. */
  async function montarLocal() {
    const eleitoral = (nome: string) =>
      encryptJson({
        local: 'ESCOLA MUNICIPAL EXEMPLO',
        logradouro: 'RUA DAS FLORES S/N',
        bairro: 'CENTRO',
        municipio: 'São Paulo',
        uf: 'SP',
        zona: '005',
        secao: '0123',
        eleitor: nome,
      });

    const pessoas = [
      { id: 'p1', name: 'Ana Souza', gender: 'MULHER', phone: '11999999999' },
      { id: 'p2', name: 'Bruno Lima', gender: 'HOMEM', phone: '11988888888' },
      { id: 'p3', name: 'Cris Melo', gender: null, phone: '' },
    ];

    for (const pessoa of pessoas) {
      member(pessoa.id, { name: pessoa.name, gender: pessoa.gender, phone: pessoa.phone });
      db.verifications[pessoa.id] = {
        member_id: pessoa.id,
        tse_status: 'SUCCESS',
        tse_payload: eleitoral(pessoa.name),
      };
      await createPendingLocation('cli-1', pessoa.id, 'POLLING_PLACE');
      await resolveLocation(pessoa.id, 'POLLING_PLACE');
    }
  }

  it('recorta o mapa pela equipe de um candidato', async () => {
    // Duas operacoes, uma pessoa localizada em cada.
    member('m-a', { client_id: 'cli-1' });
    member('m-b', { client_id: 'cli-2' });
    await createPendingLocation('cli-1', 'm-a', 'RESIDENCE');
    await resolveLocation('m-a', 'RESIDENCE');
    await createPendingLocation('cli-2', 'm-b', 'RESIDENCE');
    await resolveLocation('m-b', 'RESIDENCE');

    const geral = await mapOverview();
    expect(geral.totals.residence).toBe(2);

    // Com o candidato, so a equipe dele conta. O filtro vai ao banco no
    // formato do PostgREST; sem operador, a consulta falharia.
    const recortado = await mapOverview('cli-1');
    expect(recortado.totals.residence).toBe(1);
    expect(recortado.pins).toHaveLength(1);
    expect(recortado.pins[0].memberId).toBe('m-a');
  });

  it('três integrantes no mesmo local geram um pino só, com as contagens', async () => {
    await montarLocal();

    const { pins, pollingPlaces } = await mapOverview();

    expect(pollingPlaces).toHaveLength(1);
    expect(pins).toHaveLength(0); // moradia nao entra aqui

    const local = pollingPlaces[0];
    // A estimativa de votos da escola: uma pessoa cadastrada, um voto.
    expect(local.total).toBe(3);
    expect(estimatedVotes(local)).toBe(3);
    expect(local.men).toBe(1);
    expect(local.women).toBe(1);
    expect(local.others).toBe(1);
    expect(local.men + local.women + local.others).toBe(local.total);

    // Telefone nao vira contador da escola: o pino fala de voto, nao de
    // qualidade de cadastro.
    expect(Object.keys(local)).not.toContain('withPhone');

    // O resumo do pino nao carrega nome, telefone nem e-mail.
    const serializado = JSON.stringify(local);
    for (const proibido of ['Ana Souza', 'Bruno', 'Cris', '11999999999', '@']) {
      expect(serializado).not.toContain(proibido);
    }
  });

  it('"Ver pessoas" traz só quem vota naquele local, sem dado sensível', async () => {
    await montarLocal();
    const { pollingPlaces } = await mapOverview();

    const lista = await placeMembers(pollingPlaces[0].locationId);

    expect(lista.total).toBe(3);
    expect(lista.items.map((item) => item.name).sort()).toEqual([
      'Ana Souza',
      'Bruno Lima',
      'Cris Melo',
    ]);

    // Telefone ausente vira nulo: a tela nao mostra linha vazia.
    expect(lista.items.find((item) => item.name === 'Cris Melo')?.phone).toBeNull();
    expect(lista.items.find((item) => item.name === 'Ana Souza')?.phone).toBe('11999999999');
    expect(lista.items.every((item) => item.clientId === 'cli-1')).toBe(true);

    const serializado = JSON.stringify(lista);
    expect(serializado).not.toMatch(/cpf|nomeMae|situacaoCadastral|renda|device/i);
  });

  it('a busca por nome filtra a lista no servidor', async () => {
    await montarLocal();
    const { pollingPlaces } = await mapOverview();

    const lista = await placeMembers(pollingPlaces[0].locationId, { search: 'bruno' });

    expect(lista.total).toBe(1);
    expect(lista.items[0].name).toBe('Bruno Lima');
  });
});
