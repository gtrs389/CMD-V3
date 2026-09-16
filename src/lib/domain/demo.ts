import { normalizePhone } from '@/lib/utils/phone';

/**
 * Dados do Time DEMO.
 *
 * Modulo PURO: nao toca no banco, nao sorteia nada de verdade e nao chama
 * servico externo nenhum. Recebe uma semente e devolve sempre o mesmo
 * conjunto — e por isso ele pode ser conferido por teste, que e onde a
 * coerencia dos numeros e garantida antes de existir uma linha no banco.
 *
 * Tudo aqui e ficticio: nomes montados a partir de listas, telefones de uma
 * faixa reservada para demonstracao, ruas e bairros inventados, escolas
 * inventadas. NAO existe CPF, titulo de eleitor, e-mail nem retorno de
 * consulta cadastral — nenhum dado de pessoa real entra em um Time DEMO.
 *
 * As coordenadas vem das ancoras abaixo, com deslocamentos calculados aqui.
 * Nenhuma consulta a SerpAPI, TSE, FonteData ou qualquer servico e feita
 * para montar um Time DEMO.
 */

/** Marca do ponto semeado no cache de coordenadas (migration 033). */
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

/** Bairros inventados: nenhum deles existe com este nome nas cidades usadas. */
const BAIRROS = [
  'Jardim Aurora', 'Vila Bonança', 'Parque das Acácias', 'Alto da Colina',
  'Recanto do Sol', 'Bairro das Palmeiras', 'Vila Serena', 'Morada Nova',
] as const;

const RUAS = [
  'Rua das Acácias', 'Avenida dos Ipês', 'Rua Monte Claro', 'Travessa do Bosque',
  'Rua Vinte e Três de Maio', 'Avenida Primavera', 'Rua do Mirante', 'Rua Sete Fontes',
  'Alameda das Cerejeiras', 'Rua Boa Esperança', 'Avenida Central', 'Rua do Horizonte',
] as const;

const ESCOLAS = [
  'Escola Municipal Aurora', 'Colégio Estadual Bonança', 'Escola Municipal Céu Azul',
  'Centro Educacional Divisa', 'Escola Municipal Encosta Verde', 'Colégio Municipal Farol',
  'Escola Estadual Girassol', 'Centro Comunitário Horizonte', 'Escola Municipal Ipê Roxo',
  'Colégio Municipal Jequitibá', 'Escola Municipal Lago Sul', 'Centro Educacional Montanha',
] as const;

/**
 * Ancoras de cidade.
 *
 * O municipio e a UF sao reais porque o mapa precisa cair em algum lugar do
 * Brasil — as ruas, os bairros, as escolas e as pessoas e que sao
 * inventados. A escolha e determinada pela semente.
 */
const CIDADES = [
  { city: 'São Paulo', state: 'SP', ddd: '11', latitude: -23.5505, longitude: -46.6333 },
  { city: 'Belo Horizonte', state: 'MG', ddd: '31', latitude: -19.9167, longitude: -43.9345 },
  { city: 'Recife', state: 'PE', ddd: '81', latitude: -8.0476, longitude: -34.877 },
  { city: 'Curitiba', state: 'PR', ddd: '41', latitude: -25.4284, longitude: -49.2733 },
] as const;

/** Distribuicao do genero, na ordem em que as pessoas sao geradas. */
const GENEROS = ['MULHER', 'HOMEM', 'MULHER', 'HOMEM', 'NAO_INFORMAR'] as const;

export type DemoGender = (typeof GENEROS)[number];

/* -------------------------------------------------------------------------
   Formato do resultado
   ------------------------------------------------------------------------- */

/** Local de votacao ficticio, ja com coordenada. */
export interface DemoPlace {
  title: string;
  address: string;
  district: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  /** Zona eleitoral ficticia da escola. */
  zone: string;
  /** Secoes ficticias que votam ali. */
  sections: string[];
}

/** Rua ficticia: uma coordenada serve a todas as pessoas daquela rua. */
export interface DemoStreet {
  street: string;
  district: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
}

/** Pessoa ficticia, com tudo o que as telas do sistema usam. */
export interface DemoPerson {
  name: string;
  phone: string;
  gender: DemoGender;
  street: string;
  district: string;
  city: string;
  state: string;
  zone: string;
  section: string;
  /** Rua (e coordenada) da moradia. */
  streetIndex: number;
  /** Local de votacao. */
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
  state: string;
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

/** Deslocamento pequeno e determinístico em torno da ancora da cidade. */
function offset(random: () => number, base: number, espalhamento: number): number {
  return Number((base + (random() - 0.5) * espalhamento).toFixed(6));
}

/**
 * Telefone de demonstracao.
 *
 * Faixa fixa e sequencial (9 8000 0000 + posicao), para os numeros nunca se
 * repetirem dentro do time e para serem reconheciveis como ficticios ao
 * lado de um numero real.
 */
function demoPhone(ddd: string, position: number): string {
  const sufixo = String(80000000 + position).padStart(8, '0');
  return `${ddd}9${sufixo}`;
}

export function buildDemoData(input: DemoInput): DemoData {
  const random = createRandom(input.seed);
  const now = input.now ?? new Date();

  const totalPessoas = clampCount(input.people, DEMO_LIMITS.minPeople, DEMO_LIMITS.maxPeople);
  const totalLocais = clampCount(input.places, DEMO_LIMITS.minPlaces, DEMO_LIMITS.maxPlaces);
  // Quantos administradores o time tiver: as pessoas se dividem entre todos
  // eles, sem teto. O minimo e um, porque um time sem administrador nao
  // teria como ser acessado.
  const totalAdmins = Math.max(1, Math.trunc(input.admins) || 1);

  const cidade = pick(random, CIDADES);
  const ocupados = new Set((input.usedPhones ?? []).map((phone) => normalizePhone(phone)));

  // Locais de votacao: cada um com a propria zona e duas secoes.
  const places: DemoPlace[] = Array.from({ length: totalLocais }, (_, index) => {
    const bairro = BAIRROS[index % BAIRROS.length];
    const zona = String(101 + index).slice(0, 3);

    return {
      title: ESCOLAS[index % ESCOLAS.length],
      address: `${RUAS[index % RUAS.length]}, ${100 + index * 7} - ${bairro}, ${cidade.city}/${cidade.state}`,
      district: bairro,
      city: cidade.city,
      state: cidade.state,
      latitude: offset(random, cidade.latitude, 0.14),
      longitude: offset(random, cidade.longitude, 0.14),
      zone: zona,
      sections: [String(1 + index * 2).padStart(4, '0'), String(2 + index * 2).padStart(4, '0')],
    };
  });

  // Ruas: uma coordenada por rua, compartilhada por quem mora nela — e o
  // mesmo comportamento do cache real, e e o que faz os pinos se agruparem
  // no mapa em vez de virar um borrao de pontos soltos.
  const totalRuas = Math.min(RUAS.length, Math.max(3, Math.ceil(totalPessoas / 4)));
  const streets: DemoStreet[] = Array.from({ length: totalRuas }, (_, index) => ({
    street: RUAS[index % RUAS.length],
    district: BAIRROS[index % BAIRROS.length],
    city: cidade.city,
    state: cidade.state,
    latitude: offset(random, cidade.latitude, 0.1),
    longitude: offset(random, cidade.longitude, 0.1),
  }));

  const people: DemoPerson[] = [];
  let posicaoTelefone = 1;

  for (let index = 0; index < totalPessoas; index += 1) {
    const placeIndex = index % totalLocais;
    const place = places[placeIndex];
    const streetIndex = index % totalRuas;
    const street = streets[streetIndex];

    // Telefone livre: nunca repete o de um administrador do proprio time,
    // senao duas pessoas entrariam pelo mesmo numero.
    let phone = demoPhone(cidade.ddd, posicaoTelefone);
    while (ocupados.has(phone)) {
      posicaoTelefone += 1;
      phone = demoPhone(cidade.ddd, posicaoTelefone);
    }
    ocupados.add(phone);
    posicaoTelefone += 1;

    people.push({
      name: `${pick(random, PRIMEIROS_NOMES)} ${pick(random, SOBRENOMES)}`,
      phone,
      gender: GENEROS[index % GENEROS.length],
      street: street.street,
      district: street.district,
      city: cidade.city,
      state: cidade.state,
      zone: place.zone,
      section: place.sections[index % place.sections.length],
      streetIndex,
      placeIndex,
      adminIndex: index % totalAdmins,
      relationshipIndex: index % 3,
      createdAt: spreadDate(index, totalPessoas, now),
    });
  }

  return { city: cidade.city, state: cidade.state, places, streets, people };
}
