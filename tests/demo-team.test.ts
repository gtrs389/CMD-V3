import { describe, expect, it } from 'vitest';
import { DEMO_DEFAULTS, DEMO_LIMITS, buildDemoData, clampCount } from '@/lib/domain/demo';
import { DEMO_CITIES, DEMO_POLLING_PLACES } from '@/lib/domain/demo-catalog';
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
    // Uma coordenada por endereço, compartilhada por quem mora nele: é o que
    // faz os pinos se agruparem no mapa, como no cache real.
    expect(data.residences.length).toBeGreaterThan(0);
  });

  it('alcança vários municípios de Alagoas, e não só a capital', () => {
    const data = gerar({ people: 120, places: 12 });

    // Uma operação estadual não cabe em uma cidade só: o mapa precisa ter
    // onde se espalhar, e o ranking de locais precisa comparar municípios.
    expect(data.cities.length).toBeGreaterThan(1);
    for (const city of data.cities) expect(DEMO_CITIES).toContain(city);
  });

  it('faz cada pessoa morar no município em que vota', () => {
    const data = gerar({ people: 120, places: 12 });

    for (const person of data.people) {
      const local = data.places[person.placeIndex];
      const morada = data.residences[person.residenceIndex];

      // Quem vota em Arapiraca não mora em Penedo. Errar isso poria a camada
      // "Pessoas" a 200 km da escola onde ela vota.
      expect(morada.city).toBe(local.place.city);
      expect(person.city).toBe(local.place.city);
    }
  });

  it('distribui com peso: o ranking de locais tem topo e base', () => {
    const data = gerar({ people: 200, places: 12 });

    const porLocal = new Map<number, number>();
    for (const person of data.people) {
      porLocal.set(person.placeIndex, (porLocal.get(person.placeIndex) ?? 0) + 1);
    }
    const contagens = [...porLocal.values()];

    // Divisão igual é o jeito mais rápido de a demonstração parecer falsa.
    expect(Math.max(...contagens)).toBeGreaterThan(Math.min(...contagens));
    // E nenhum local fica vazio: escola sem ninguém no mapa é dado quebrado.
    expect(Math.min(...contagens)).toBeGreaterThanOrEqual(1);
    expect(contagens.reduce((total, valor) => total + valor, 0)).toBe(200);
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
      expect(data.residences[person.residenceIndex]).toBeDefined();
    }
  });

  it('mantém zona e seção coerentes com o local de votação da pessoa', () => {
    const data = gerar();

    for (const person of data.people) {
      const local = data.places[person.placeIndex];
      // A escola e a pessoa precisam concordar: a quebra por seção do mapa
      // sai do CADASTRO, e discordar faria a soma das seções não fechar.
      expect(person.zone).toBe(local.zone);

      // Seção só existe quando o TRE/AL publicou as do local. Onde ele não
      // publicou, o campo fica vazio: inventar um número aqui falsificaria a
      // quebra por seção do mapa.
      if (local.sections.length === 0) expect(person.section).toBeNull();
      else expect(local.sections).toContain(person.section);
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

  it('divide as pessoas entre todos os administradores, sem teto', () => {
    const tres = gerar({ people: 30, admins: 3 });
    expect(new Set(tres.people.map((person) => person.adminIndex))).toEqual(new Set([0, 1, 2]));

    // Nao existe limite de administradores: o time se divide entre todos.
    const muitos = gerar({ people: 60, admins: 25 });
    const responsaveis = new Set(muitos.people.map((person) => person.adminIndex));
    expect(responsaveis.size).toBe(25);
    expect(Math.max(...responsaveis)).toBe(24);

    // Mesmo com mais administradores do que pessoas, ninguem fica sem
    // responsavel e nenhum indice aponta para administrador inexistente.
    const poucos = gerar({ people: 4, admins: 12 });
    for (const person of poucos.people) {
      expect(person.adminIndex).toBeGreaterThanOrEqual(0);
      expect(person.adminIndex).toBeLessThan(12);
    }
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

  it('não produz coordenada nenhuma: elas vêm do endereço, no servidor', () => {
    const data = gerar({ people: 30, places: 6 });

    // Era daqui que saíam os pinos em Recife e no mar: âncoras escritas de
    // memória mais um deslocamento aleatório. O gerador não devolve mais
    // latitude nem longitude — quem as obtém é a consulta de endereço do
    // próprio sistema, que recusa o que cai fora de Alagoas.
    const bruto = JSON.stringify(data);
    expect(bruto).not.toContain('latitude');
    expect(bruto).not.toContain('longitude');

    for (const person of data.people) {
      expect(Object.keys(person)).not.toContain('latitude');
      expect(Object.keys(person)).not.toContain('longitude');
    }
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

    // Pedir mais locais do que existem não inventa o próximo: o teto real é o
    // catálogo de locais de votação conferidos.
    expect(data.places).toHaveLength(DEMO_POLLING_PLACES.length);
    expect(data.places.length).toBeLessThanOrEqual(DEMO_LIMITS.maxPlaces);

    // E nunca mais locais do que pessoas: sobraria escola sem ninguém.
    const poucas = gerar({ people: 3, places: 12 });
    expect(poucas.places).toHaveLength(3);
  });

  it('é todo de Alagoas, sem nenhuma âncora de outro estado', () => {
    const data = gerar({ people: 60, places: 6 });

    expect(data.state).toBe('AL');
    for (const person of data.people) {
      expect(person.state).toBe('AL');
      expect(DEMO_CITIES).toContain(person.city);
    }
    for (const local of data.places) expect(local.place.state).toBe('AL');

    // O print que abriu esta correção mostrava pinos em Recife. Nenhum
    // pedaço do conjunto pode sequer mencionar outro estado.
    const bruto = JSON.stringify(data);
    for (const proibido of ['Recife', 'PE', 'São Paulo', 'Belo Horizonte', 'Curitiba']) {
      expect(bruto).not.toContain(proibido);
    }
  });

  it('não repete nome nem telefone, mesmo no time cheio', () => {
    // Cinco mil pessoas: mais do que o número de combinações de um nome com
    // um sobrenome só. É aqui que o segundo sobrenome entra.
    const data = gerar({ people: DEMO_LIMITS.maxPeople, places: 12 });
    expect(data.people).toHaveLength(5000);

    const nomes = data.people.map((person) => person.name);
    expect(new Set(nomes).size).toBe(nomes.length);

    const telefones = data.people.map((person) => normalizePhone(person.phone));
    expect(new Set(telefones).size).toBe(telefones.length);
    for (const telefone of telefones) {
      expect(isValidPhone(telefone)).toBe(true);
      // Nenhum vira documento por acaso, em nenhum tamanho de time.
      expect(isValidCpf(telefone)).toBe(false);
    }

    // Os locais continuam fechando com o total, sem nenhum vazio.
    const porLocal = new Map<number, number>();
    for (const person of data.people) {
      porLocal.set(person.placeIndex, (porLocal.get(person.placeIndex) ?? 0) + 1);
    }
    expect(porLocal.size).toBe(data.places.length);
    expect([...porLocal.values()].reduce((total, valor) => total + valor, 0)).toBe(5000);
  });

  it('usa somente locais de votação do catálogo conferido', () => {
    const data = gerar({ places: 6 });

    for (const local of data.places) {
      // Nome, endereço, bairro, município, zona e seções saem do catálogo, e
      // o catálogo guarda a fonte de cada linha.
      expect(DEMO_POLLING_PLACES).toContain(local.place);
      expect(local.place.source).toMatch(/^https:\/\//);
    }
  });
});
