import { describe, expect, it } from 'vitest';
import {
  DEMO_DEFAULTS,
  DEMO_LIMITS,
  DEMO_PROVIDER,
  buildDemoData,
  clampCount,
} from '@/lib/domain/demo';
import { isValidPhone, normalizePhone } from '@/lib/utils/phone';
import { isValidCpf } from '@/lib/utils/documents';

/**
 * Dados do Time DEMO.
 *
 * A exigencia central e "os numeros precisam bater em todas as telas": o
 * total do time, as listas, a soma das pessoas por local de votacao, o
 * grafico e os indicadores de hoje, sete dias e mes leem OS MESMOS
 * registros. Se a geracao produzir um conjunto incoerente, nenhuma tela
 * consegue consertar isso depois — entao a coerencia e conferida aqui,
 * antes de existir uma linha no banco.
 */

const AGORA = new Date('2026-09-15T15:00:00.000Z');

function gerar(overrides: Partial<Parameters<typeof buildDemoData>[0]> = {}) {
  return buildDemoData({
    seed: 'demo_teste_1234',
    people: DEMO_DEFAULTS.people,
    places: DEMO_DEFAULTS.places,
    admins: 2,
    now: AGORA,
    ...overrides,
  });
}

describe('dados de demonstração', () => {
  it('gera exatamente a quantidade pedida', () => {
    const data = gerar({ people: 30, places: 6 });

    expect(data.people).toHaveLength(30);
    expect(data.places).toHaveLength(6);
    // Uma coordenada por rua, compartilhada por quem mora nela: e o que faz
    // os pinos se agruparem no mapa, como no cache real.
    expect(data.streets.length).toBeGreaterThan(0);
  });

  it('distribui todas as pessoas entre os locais de votação, sem sobra', () => {
    const data = gerar({ people: 30, places: 6 });

    const porLocal = new Map<number, number>();
    for (const person of data.people) {
      porLocal.set(person.placeIndex, (porLocal.get(person.placeIndex) ?? 0) + 1);
    }

    // A soma das pessoas nos locais fecha com o total do time: e a mesma
    // conta que a tela do mapa faz.
    const soma = [...porLocal.values()].reduce((total, valor) => total + valor, 0);
    expect(soma).toBe(data.people.length);

    // Nenhum local fica vazio, e nenhuma pessoa aponta para local inexistente.
    expect(porLocal.size).toBe(data.places.length);
    for (const person of data.people) {
      expect(data.places[person.placeIndex]).toBeDefined();
      expect(data.streets[person.streetIndex]).toBeDefined();
    }
  });

  it('mantém zona e seção coerentes com o local de votação da pessoa', () => {
    const data = gerar();

    for (const person of data.people) {
      const local = data.places[person.placeIndex];
      // A escola e a pessoa precisam concordar: a quebra por seção do mapa
      // sai do CADASTRO, e discordar faria a soma das seções não fechar.
      expect(person.zone).toBe(local.zone);
      expect(local.sections).toContain(person.section);
    }
  });

  it('espalha os cadastros entre hoje, os sete dias e o mês', () => {
    const data = gerar({ people: 30 });

    const inicioDoDia = new Date(AGORA);
    inicioDoDia.setHours(0, 0, 0, 0);
    const seteDias = AGORA.getTime() - 7 * 24 * 60 * 60 * 1000;
    const inicioDoMes = new Date(AGORA.getFullYear(), AGORA.getMonth(), 1).getTime();

    const datas = data.people.map((person) => new Date(person.createdAt).getTime());

    expect(datas.some((valor) => valor >= inicioDoDia.getTime())).toBe(true);
    expect(datas.some((valor) => valor >= seteDias && valor < inicioDoDia.getTime())).toBe(true);
    expect(datas.some((valor) => valor < seteDias)).toBe(true);

    // Nenhum cadastro no futuro nem antes do mês: os três indicadores contam
    // estes mesmos registros, e um deles fora da janela faria as contas
    // divergirem entre as telas.
    for (const valor of datas) {
      expect(valor).toBeLessThanOrEqual(AGORA.getTime());
      expect(valor).toBeGreaterThanOrEqual(inicioDoMes);
    }
  });

  it('divide as pessoas entre todos os administradores', () => {
    const data = gerar({ people: 30, admins: 3 });
    const responsaveis = new Set(data.people.map((person) => person.adminIndex));

    expect(responsaveis).toEqual(new Set([0, 1, 2]));
  });

  it('não repete telefone e não usa o de um administrador', () => {
    const doAdmin = '11980000001';
    const data = gerar({ people: 40, usedPhones: [doAdmin] });

    const telefones = data.people.map((person) => normalizePhone(person.phone));

    expect(new Set(telefones).size).toBe(telefones.length);
    expect(telefones).not.toContain(normalizePhone(doAdmin));
    // Telefone precisa ser valido: e ele que identifica a pessoa no acesso.
    for (const telefone of telefones) expect(isValidPhone(telefone)).toBe(true);
  });

  it('não inventa CPF, título de eleitor nem e-mail', () => {
    const data = gerar();
    const bruto = JSON.stringify(data);

    // Nenhum campo do conjunto pode carregar documento ou e-mail: os dados
    // são demonstrativos, e documento fictício "válido" é pior do que nenhum.
    for (const person of data.people) {
      expect(Object.keys(person)).not.toContain('cpf');
      expect(Object.keys(person)).not.toContain('voterId');
      expect(Object.keys(person)).not.toContain('email');
    }
    expect(bruto).not.toContain('@');

    // Nenhum número de 11 dígitos do conjunto passa como CPF válido.
    for (const person of data.people) {
      expect(isValidCpf(normalizePhone(person.phone))).toBe(false);
    }
  });

  it('gera coordenadas válidas e distintas', () => {
    const data = gerar({ people: 30, places: 6 });
    const pontos = [...data.places, ...data.streets];

    for (const ponto of pontos) {
      expect(ponto.latitude).toBeGreaterThanOrEqual(-90);
      expect(ponto.latitude).toBeLessThanOrEqual(90);
      expect(ponto.longitude).toBeGreaterThanOrEqual(-180);
      expect(ponto.longitude).toBeLessThanOrEqual(180);
    }

    // Pontos colados demais viram um borrão: cada lugar tem o seu.
    const chaves = pontos.map((ponto) => `${ponto.latitude},${ponto.longitude}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it('é reproduzível: a mesma semente devolve o mesmo time', () => {
    const a = gerar({ seed: 'mesma_semente_01' });
    const b = gerar({ seed: 'mesma_semente_01' });
    const c = gerar({ seed: 'outra_semente_02' });

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('respeita os limites no servidor, e não apenas na tela', () => {
    expect(clampCount(999999, DEMO_LIMITS.minPeople, DEMO_LIMITS.maxPeople)).toBe(
      DEMO_LIMITS.maxPeople,
    );
    expect(clampCount(0, DEMO_LIMITS.minPeople, DEMO_LIMITS.maxPeople)).toBe(
      DEMO_LIMITS.minPeople,
    );
    expect(clampCount(Number.NaN, DEMO_LIMITS.minPlaces, DEMO_LIMITS.maxPlaces)).toBe(
      DEMO_LIMITS.minPlaces,
    );

    const data = gerar({ people: 10_000, places: 10_000 });
    expect(data.people).toHaveLength(DEMO_LIMITS.maxPeople);
    expect(data.places).toHaveLength(DEMO_LIMITS.maxPlaces);
  });

  it('marca a origem das coordenadas como semeada, nunca como consulta paga', () => {
    // O cache do mapa e um so: o que separa o ponto semeado do consultado na
    // SerpAPI e esta marca, gravada na propria linha (migration 033).
    expect(DEMO_PROVIDER).toBe('DEMO_SEED');
  });
});
