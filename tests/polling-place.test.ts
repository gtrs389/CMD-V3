import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PollingPlaceRow } from '@/lib/supabase/tables';

/**
 * Busca do local de votacao na NOSSA tabela (migration 042).
 *
 * O ponto destes testes e um so: nada sai daqui para provedor nenhum, e a
 * busca acontece — ou nao acontece — pelos tres numeros que a identificam.
 */

const consultas: { table: string; filters: Record<string, string> }[] = [];
let resposta: PollingPlaceRow | null = null;
/** Banco fora do ar na proxima leitura. */
let falhar = false;

vi.mock('@/lib/supabase/rest', () => ({
  selectOne: async (table: string, options: { filters?: Record<string, string> }) => {
    consultas.push({ table, filters: options.filters ?? {} });
    if (falhar) throw new Error('banco fora');
    return resposta;
  },
  selectRows: async () => [],
  insertOne: async () => ({ id: 'novo' }),
  updateRows: async () => [],
  deleteRows: async () => [],
  inFilter: (values: string[]) => `in.(${values.join(',')})`,
}));

const { findPollingPlace, pollingPlaceAddress } = await import('@/lib/server/polling-place.service');

function local(): PollingPlaceRow {
  return {
    id: 'loc-1',
    uf: 'AL',
    city_code: 27014,
    city: 'ÁGUA BRANCA',
    zone: 39,
    name: 'COLEGIO CENECISTA/ COLÉGIO JOSÉ GOMES LIMA',
    place_type: 'Convencional',
    address: 'RUA BARAO DE AGUA BRANCA - NUMERO 50',
    district: 'CENTRO',
    postal_code: '57490000',
    latitude: -9.25912678,
    longitude: -37.93496283,
    section_count: 8,
    sections: [1, 2, 3, 4, 16, 17, 35, 58],
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  consultas.length = 0;
  resposta = local();
  falhar = false;
});

describe('busca do local de votação', () => {
  it('procura por UF, zona e seção', async () => {
    const encontrado = await findPollingPlace({ uf: 'AL', zone: '39', section: '16' });

    expect(encontrado?.name).toContain('JOSÉ GOMES LIMA');
    expect(consultas).toHaveLength(1);
    expect(consultas[0].table).toBe('cmd_polling_places');
    expect(consultas[0].filters).toEqual({
      uf: 'eq.AL',
      zone: 'eq.39',
      sections: 'cs.{16}',
    });
  });

  it('zero à frente não cria outra zona: "005" e "5" são a mesma', async () => {
    // O TSE responde com zeros à frente; quem digita quase nunca os escreve.
    await findPollingPlace({ uf: 'al', zone: '005', section: '0016' });

    expect(consultas[0].filters).toEqual({
      uf: 'eq.AL',
      zone: 'eq.5',
      sections: 'cs.{16}',
    });
  });

  it('aceita número tanto quanto texto', async () => {
    await findPollingPlace({ uf: 'SP', zone: 1, section: 2 });
    expect(consultas[0].filters).toEqual({ uf: 'eq.SP', zone: 'eq.1', sections: 'cs.{2}' });
  });

  it('sem os três números não há busca nenhuma', async () => {
    expect(await findPollingPlace({ uf: 'AL', zone: '39', section: '' })).toBeNull();
    expect(await findPollingPlace({ uf: 'AL', zone: null, section: '16' })).toBeNull();
    expect(await findPollingPlace({ uf: '', zone: '39', section: '16' })).toBeNull();
    // UF que não é sigla não vira consulta: zona repete entre estados, e um
    // local errado seria pior do que nenhum.
    expect(await findPollingPlace({ uf: 'Alagoas', zone: '39', section: '16' })).toBeNull();

    expect(consultas).toHaveLength(0);
  });

  it('não encontrado é nulo, e não um palpite', async () => {
    resposta = null;
    expect(await findPollingPlace({ uf: 'AL', zone: '99', section: '1' })).toBeNull();
  });

  it('falha de leitura não derruba o cadastro', async () => {
    falhar = true;

    // Nunca lanca: o cadastro da pessoa nao pode depender do mapa.
    await expect(findPollingPlace({ uf: 'AL', zone: '39', section: '16' })).resolves.toBeNull();
  });
});

describe('endereço do local', () => {
  it('junta endereço, bairro e município com a UF', () => {
    expect(pollingPlaceAddress(local())).toBe(
      'RUA BARAO DE AGUA BRANCA - NUMERO 50, CENTRO, ÁGUA BRANCA - AL',
    );
  });

  it('pula o que a planilha não trouxe', () => {
    expect(pollingPlaceAddress({ ...local(), address: null, district: null })).toBe(
      'ÁGUA BRANCA - AL',
    );
  });
});
