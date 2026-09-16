import { normalizePhone } from '@/lib/utils/phone';
import {
  DEMO_ADDRESSES,
  DEMO_POLLING_PLACES,
  DEMO_STATE,
  type DemoAddress,
  type DemoPollingPlace,
} from './demo-catalog';

/**
 * Dados do Time DEMO.
 *
 * Modulo PURO: nao toca no banco, nao sorteia nada de verdade e nao chama
 * servico externo nenhum. Recebe uma semente e devolve sempre o mesmo
 * conjunto — e por isso ele pode ser conferido por teste, que e onde a
 * coerencia dos numeros e garantida antes de existir uma linha no banco.
 *
 * AS PESSOAS sao ficticias: nome montado a partir de listas, telefone de uma
 * faixa de demonstracao, genero distribuido. Nao existe CPF, titulo de
 * eleitor, e-mail nem retorno de consulta cadastral — nenhum dado de pessoa
 * real entra em um Time DEMO.
 *
 * OS LUGARES NAO SAO. Escola, rua, bairro, municipio, UF, zona e secao vem
 * do catalogo (`demo-catalog.ts`), que so tem local de votacao REAL de
 * Alagoas, divulgado pelo TRE/AL, com a fonte anotada. Antes eu inventava os
 * tres — e o resultado foi um mapa em Recife com pinos no mar.
 *
 * COORDENADA NAO SE ESCREVE AQUI, e nao se calcula em lugar nenhum: este
 * modulo nao devolve latitude nem longitude. Quem as obtem e o servidor,
 * pelo MESMO caminho que ja poe um integrante real no mapa, e o resultado
 * fica no cache de coordenadas do sistema.
 */

/**
 * Marca do ponto semeado no cache de coordenadas (migration 033).
 *
 * HERANCA. Nenhuma coordenada nova nasce com esta marca: as do Time DEMO vem
 * hoje da consulta de endereco do proprio sistema, e por isso sao gravadas
 * como a consulta que realmente aconteceu. A marca continua existindo para
 * uma coisa so — reconhecer, e limpar, os pontos que a versao anterior do
 * gerador escreveu de memoria.
 */
export const DEMO_PROVIDER = 'DEMO_SEED';

/** Valores iniciais do formulario de criacao. O ADMIN pode alterar. */
export const DEMO_DEFAULTS = { people: 30, places: 6 } as const;

/**
 * Limites conferidos no servidor, e nao apenas na tela.
 *
 * Eles existem para uma apresentacao nao virar uma carga de milhares de
 * linhas por engano — e valem para o que e GERADO automaticamente.
 *
 * Administrador nao entra nesta lista de proposito: quem os cadastra e o
 * ADMIN geral, um por um, e nao ha numero certo de administradores para um
 * time. Cada um continua passando pelas mesmas regras de nome, telefone e
 * telefone unico no time.
 */
export const DEMO_LIMITS = {
  minPeople: 1,
  maxPeople: 300,
  minPlaces: 1,
  maxPlaces: 30,
} as const;

/* -------------------------------------------------------------------------
   Sorteio reproduzivel
   ------------------------------------------------------------------------- */

/** Hash simples da semente, para o gerador comecar sempre no mesmo ponto. */
function seedNumber(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Gerador determinístico (mulberry32).
 *
 * A mesma semente devolve o mesmo Time DEMO. Isso nao e detalhe: e o que
 * permite ao teste afirmar como os dados ficam distribuidos, em vez de
 * apenas contar linhas.
 */
function createRandom(seed: string): () => number {
  let state = seedNumber(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, list: readonly T[]): T {
  return list[Math.floor(random() * list.length) % list.length];
}

/* -------------------------------------------------------------------------
   Listas ficticias
   ------------------------------------------------------------------------- */

const PRIMEIROS_NOMES = [
  'Ana', 'Bruno', 'Carla', 'Daniel', 'Eliane', 'Fábio', 'Gabriela', 'Heitor',
  'Isabel', 'João', 'Karina', 'Lucas', 'Marina', 'Nelson', 'Olívia', 'Paulo',
  'Queila', 'Rafael', 'Sônia', 'Tiago', 'Úrsula', 'Vinícius', 'Wagner', 'Yara',
] as const;

const SOBRENOMES = [
  'Almeida', 'Barbosa', 'Cardoso', 'Duarte', 'Esteves', 'Falcão', 'Gonçalves',
  'Henriques', 'Ibiapina', 'Junqueira', 'Lacerda', 'Martins', 'Nogueira',
  'Oliveira', 'Pacheco', 'Quintela', 'Rezende', 'Siqueira', 'Teixeira', 'Valadares',
] as const;

/** Distribuicao do genero, na ordem em que as pessoas sao geradas. */
const GENEROS = ['MULHER', 'HOMEM', 'MULHER', 'HOMEM', 'NAO_INFORMAR'] as const;

export type DemoGender = (typeof GENEROS)[number];

/* -------------------------------------------------------------------------
   Formato do resultado
   ------------------------------------------------------------------------- */

/**
 * Local de votacao escolhido para o Time DEMO.
 *
 * E uma entrada do catalogo, e nao um lugar novo: nome, endereco, bairro,
 * municipio, UF, zona e secoes vem de la, ja conferidos. Sem coordenada — o
 * servidor a resolve pelo endereco, como faz com qualquer integrante real.
 */
export interface DemoPlace {
  place: DemoPollingPlace;
  /** Zona eleitoral verificada, ou nula quando a fonte nao a publicou. */
  zone: string | null;
  /** Secoes verificadas. Vazio quando a fonte nao as publicou. */
  sections: readonly string[];
}

/** Endereco de moradia: um logradouro real do catalogo. */
export interface DemoStreet {
  address: DemoAddress;
}

/** Pessoa ficticia, com tudo o que as telas do sistema usam. */
export interface DemoPerson {
  name: string;
  phone: string;
  gender: DemoGender;
  street: string;
  district: string;
  city: string;
  state: typeof DEMO_STATE;
  /**
   * Zona e secao do local onde a pessoa vota.
   *
   * Nulas quando o TRE/AL nao publicou zona ou secao daquele local. A tela
   * mostra "sem zona/secao", que e a verdade — inventar um numero aqui
   * falsificaria a quebra por secao do mapa.
   */
  zone: string | null;
  section: string | null;
  /** Endereco (e coordenada) da moradia, por posicao em `streets`. */
  streetIndex: number;
  /** Local de votacao, por posicao em `places`. */
  placeIndex: number;
  /** Administrador do time que aparece em "Cadastrado por". */
  adminIndex: number;
  /** Opcao de vinculo do formulario, por posicao. */
  relationshipIndex: number;
  /** Instante do cadastro, em ISO. */
  createdAt: string;
}

export interface DemoData {
  city: string;
  state: typeof DEMO_STATE;
  places: DemoPlace[];
  streets: DemoStreet[];
  people: DemoPerson[];
}

export interface DemoInput {
  /** Semente: o mesmo valor devolve exatamente o mesmo time. */
  seed: string;
  people: number;
  places: number;
  /**
   * Quantos administradores o time tem: as pessoas se dividem entre todos,
   * sejam dois ou vinte. Nao ha limite.
   */
  admins: number;
  /** Telefones ja usados no time (os dos administradores). */
  usedPhones?: readonly string[];
  /** Agora. Recebido de fora para o teste poder fixar o relogio. */
  now?: Date;
}

/** Mantem a quantidade dentro dos limites aceitos pelo servidor. */
export function clampCount(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/* -------------------------------------------------------------------------
   Datas
   ------------------------------------------------------------------------- */

const DIA = 24 * 60 * 60 * 1000;

/**
 * Distribui os cadastros entre hoje, os ultimos sete dias e o mes atual.
 *
 * Os tres indicadores da tela leem os MESMOS registros, entao a distribuicao
 * precisa cair dentro das tres janelas de verdade — e nunca no futuro nem
 * antes do inicio do mes, ou os numeros de "hoje", "7 dias" e "este mes"
 * deixariam de fechar entre si.
 */
function spreadDate(index: number, total: number, now: Date): string {
  const inicioDoMes = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const agora = now.getTime();

  // Uma em cada cinco no dia de hoje; uma em cada cinco nos seis dias
  // anteriores; o restante espalhado pelo mes.
  const posicao = index % 5;
  let alvo: number;

  if (posicao === 0) {
    // Hoje, em horas ja passadas.
    const horas = 1 + (index % 8);
    alvo = agora - horas * 60 * 60 * 1000;
  } else if (posicao === 1 || posicao === 2) {
    alvo = agora - (1 + (index % 6)) * DIA;
  } else {
    alvo = agora - (7 + (index % 20)) * DIA;
  }

  // Nunca antes do inicio do mes: os indicadores do mes contam estes mesmos
  // registros, e um cadastro do mes passado sumiria do total mensal.
  const limitado = Math.max(alvo, inicioDoMes + (index % 60) * 60 * 1000);
  return new Date(Math.min(limitado, agora - 60 * 1000)).toISOString();
}

/* -------------------------------------------------------------------------
   Geracao
   ------------------------------------------------------------------------- */

/**
 * Telefone de demonstracao.
 *
 * Faixa fixa e sequencial (9 8000 0000 + posicao), para os numeros nunca se
 * repetirem dentro do time e para serem reconheciveis como ficticios ao
 * lado de um numero real. O DDD e o de Alagoas.
 */
const DDD_ALAGOAS = '82';

function demoPhone(position: number): string {
  const sufixo = String(80000000 + position).padStart(8, '0');
  return `${DDD_ALAGOAS}9${sufixo}`;
}

export function buildDemoData(input: DemoInput): DemoData {
  const random = createRandom(input.seed);
  const now = input.now ?? new Date();

  const totalPessoas = clampCount(input.people, DEMO_LIMITS.minPeople, DEMO_LIMITS.maxPeople);
  const totalAdmins = Math.max(1, Math.trunc(input.admins) || 1);

  // Locais: os do catalogo, na ordem em que estao la. O teto nao e uma
  // escolha de estilo — nao existe local de votacao alem dos conferidos, e
  // inventar o sétimo seria voltar ao erro que gerou o mapa em Recife.
  const totalLocais = Math.min(
    clampCount(input.places, DEMO_LIMITS.minPlaces, DEMO_LIMITS.maxPlaces),
    DEMO_POLLING_PLACES.length,
  );

  const places: DemoPlace[] = DEMO_POLLING_PLACES.slice(0, totalLocais).map((place) => ({
    place,
    zone: place.zone,
    sections: place.sections,
  }));

  // Ruas: os mesmos logradouros reais. Uma coordenada por rua, compartilhada
  // por quem mora nela — e o comportamento do cache real, e e o que faz os
  // pinos se agruparem no mapa em vez de virar um borrao.
  const streets: DemoStreet[] = DEMO_ADDRESSES.slice(0, Math.max(totalLocais, 1)).map(
    (address) => ({ address }),
  );

  const ocupados = new Set((input.usedPhones ?? []).map((phone) => normalizePhone(phone)));
  const people: DemoPerson[] = [];
  let posicaoTelefone = 1;

  for (let index = 0; index < totalPessoas; index += 1) {
    const placeIndex = index % places.length;
    const escolhido = places[placeIndex];
    const streetIndex = index % streets.length;
    const morada = streets[streetIndex].address;

    // Telefone livre: nunca repete o de um administrador do proprio time,
    // senao duas pessoas entrariam pelo mesmo numero.
    let phone = demoPhone(posicaoTelefone);
    while (ocupados.has(phone)) {
      posicaoTelefone += 1;
      phone = demoPhone(posicaoTelefone);
    }
    ocupados.add(phone);
    posicaoTelefone += 1;

    // Secao so quando o TRE/AL publicou as do local. Sem isso, nula.
    const section =
      escolhido.sections.length > 0
        ? escolhido.sections[index % escolhido.sections.length]
        : null;

    people.push({
      name: `${pick(random, PRIMEIROS_NOMES)} ${pick(random, SOBRENOMES)}`,
      phone,
      gender: GENEROS[index % GENEROS.length],
      street: morada.street,
      district: morada.district,
      city: morada.city,
      state: DEMO_STATE,
      zone: escolhido.zone,
      section,
      streetIndex,
      placeIndex,
      adminIndex: index % totalAdmins,
      relationshipIndex: index % 3,
      createdAt: spreadDate(index, totalPessoas, now),
    });
  }

  return {
    city: places[0]?.place.city ?? DEMO_ADDRESSES[0]?.city ?? 'Maceió',
    state: DEMO_STATE,
    places,
    streets,
    people,
  };
}
