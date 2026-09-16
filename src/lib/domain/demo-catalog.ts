/**
 * Catalogo do Time DEMO: locais de votacao REAIS de Alagoas.
 *
 * Substitui as escolas, ruas e coordenadas que eu havia inventado — e que
 * puseram marcador em Recife e no mar. Aqui nao ha nada inventado: cada
 * entrada e um local de votacao divulgado pelo proprio Tribunal Regional
 * Eleitoral de Alagoas, com o endereco como ele publicou, e a fonte anotada
 * linha a linha.
 *
 * O QUE NAO ESTA AQUI, E POR QUE
 *
 *   COORDENADA  nao e escrita neste arquivo. Ela vem da MESMA consulta que o
 *               sistema ja usa para pôr um integrante real no mapa, e fica
 *               no cache de `cmd_map_locations`. Coordenada digitada de
 *               memoria e exatamente o erro que gerou o print com pinos no
 *               mar.
 *   ZONA/SECAO  so aparecem quando o TRE/AL as publicou junto do local. Onde
 *               ele nao publicou, o campo fica vazio — e a tela mostra "sem
 *               zona/secao", que e a verdade.
 *
 * Nenhum dado de eleitor entra aqui: sao enderecos de predios publicos e
 * privados usados como local de votacao, ja divulgados pela Justica
 * Eleitoral.
 */

/**
 * Versao do catalogo.
 *
 * Marca, linha a linha, quais registros do Time DEMO foram GERADOS — e por
 * qual catalogo. E o que permite corrigir um Time DEMO ja criado sem tocar em
 * nada mais: a rotina de correcao regenera somente o que carrega esta marca,
 * e deixa intactos o time, os administradores, os acessos, os links, as
 * configuracoes e qualquer pessoa cadastrada a mao.
 *
 * Mude a versao sempre que o catalogo mudar de conteudo.
 */
export const DEMO_SEED_VERSION = 'al-tre-2026-1' as const;

/** Unico estado aceito no Time DEMO. */
export const DEMO_STATE = 'AL' as const;

/**
 * Limites de Alagoas, usados para recusar qualquer ponto fora do estado.
 *
 * Retangulo folgado sobre o territorio alagoano. Ele nao decide sozinho se o
 * ponto presta: a garantia de verdade e que NENHUMA coordenada e calculada —
 * todas vem de um endereco real resolvido pelo geocodificador. O retangulo e
 * a ultima barreira contra um endereco que resolveu para o lugar errado.
 */
export const ALAGOAS_BOUNDS = {
  minLat: -10.55,
  maxLat: -8.75,
  minLng: -38.3,
  maxLng: -35.1,
} as const;

/**
 * Centro do estado, para quando nao ha ponto nenhum para enquadrar.
 *
 * Aproximadamente o centro geografico de Alagoas. Nunca Recife, nunca outro
 * estado.
 */
export const ALAGOAS_CENTER = { latitude: -9.5713, longitude: -36.782 } as const;

/** Local de votacao real, como o TRE/AL o publicou. */
export interface DemoPollingPlace {
  /** Identificador estavel: e ele que torna a regeneracao idempotente. */
  id: string;
  /** Nome oficial, como divulgado. */
  name: string;
  /** Logradouro. */
  street: string;
  /** Numero. Nulo quando o local e divulgado como "s/n". */
  number: string | null;
  district: string;
  city: string;
  state: typeof DEMO_STATE;
  /** Zona eleitoral. Nula quando a fonte nao a publicou junto do local. */
  zone: string | null;
  /** Secoes. Vazio quando a fonte nao as publicou. */
  sections: readonly string[];
  /** Onde isto foi conferido. */
  source: string;
}

const TRE_AL_2026 =
  'https://www.tre-al.jus.br/comunicacao/noticias/2026/Agosto/' +
  'tre-al-divulga-alteracoes-em-locais-de-votacao-para-as-eleicoes-2026';

/**
 * Locais de votacao de Maceio divulgados pelo TRE/AL para as Eleicoes 2026.
 *
 * A lista e curta de proposito: cada linha foi conferida na divulgacao do
 * TRE/AL. Preferi seis locais verificados a trinta inventados.
 */
export const DEMO_POLLING_PLACES: readonly DemoPollingPlace[] = [
  {
    id: 'mcz-cmei-joao-pedro',
    name: 'Creche Escola CMEI João Pedro da Silva Bernardino',
    street: 'Rua Boa Vista',
    number: null,
    district: 'Ouro Preto',
    city: 'Maceió',
    state: DEMO_STATE,
    // Divulgado como novo local da 1a Zona Eleitoral; as secoes nao foram
    // publicadas junto, entao ficam de fora.
    zone: '1',
    sections: [],
    source: TRE_AL_2026,
  },
  {
    id: 'mcz-theotonio-vilela-brandao',
    name: 'Escola Estadual Prof. Theotônio Vilela Brandão',
    street: 'Rua Coronel Adauto Gomes Barbosa',
    number: null,
    // A fonte escreve "Santo Eduardo (Poço)": Poço e o bairro.
    district: 'Poço',
    city: 'Maceió',
    state: DEMO_STATE,
    zone: '2',
    sections: ['143', '144', '271', '285', '310'],
    source: TRE_AL_2026,
  },
  {
    id: 'mcz-rosalvo-ribeiro-dos-santos',
    name: 'Colégio Rosalvo Ribeiro dos Santos',
    street: 'Rua Bonfim',
    number: '344',
    district: 'Jacintinho',
    city: 'Maceió',
    state: DEMO_STATE,
    zone: '2',
    sections: ['442'],
    source: TRE_AL_2026,
  },
  {
    id: 'mcz-maple-bear-campus-ii',
    name: 'Maple Bear Canadian School – Campus II',
    street: 'Rua Joaquim Marques Luz',
    number: '108',
    district: 'Jatiúca',
    city: 'Maceió',
    state: DEMO_STATE,
    zone: '2',
    sections: ['381', '392', '395', '396', '398', '401', '403', '404', '406', '425'],
    source: TRE_AL_2026,
  },
  {
    id: 'mcz-santa-ursula-unidade-nova',
    name: 'Colégio Santa Úrsula – Unidade Nova',
    street: 'Rua Pio XII',
    number: '705',
    district: 'Jatiúca',
    city: 'Maceió',
    state: DEMO_STATE,
    // Zona e secoes nao publicadas junto deste local: ficam vazias.
    zone: null,
    sections: [],
    source: TRE_AL_2026,
  },
  {
    id: 'mcz-sesi-senai',
    name: 'Escola SESI/SENAI',
    street: 'Avenida Antônio Lisboa de Amorim',
    number: '1751',
    district: 'Benedito Bentes II',
    city: 'Maceió',
    state: DEMO_STATE,
    zone: null,
    sections: [],
    source: TRE_AL_2026,
  },
];

/**
 * Enderecos de moradia do Time DEMO.
 *
 * Sao os MESMOS logradouros reais dos locais de votacao acima, sem numero: o
 * sistema so guarda rua, bairro, municipio e UF de um integrante, e o ponto
 * mostrado no mapa e o da RUA, nunca o da casa. Reaproveitar os logradouros
 * ja conferidos evita inventar endereco novo — e faz as pessoas morarem
 * perto de onde votam, como na vida real.
 */
export interface DemoAddress {
  id: string;
  street: string;
  district: string;
  city: string;
  state: typeof DEMO_STATE;
  source: string;
}

export const DEMO_ADDRESSES: readonly DemoAddress[] = DEMO_POLLING_PLACES.map((place) => ({
  id: `end-${place.id}`,
  street: place.street,
  district: place.district,
  city: place.city,
  state: place.state,
  source: place.source,
}));

/* -------------------------------------------------------------------------
   Barreiras de coordenada
   ------------------------------------------------------------------------- */

/** Numero utilizavel como coordenada: existe, e finito e nao e zero. */
function isRealNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** O ponto esta dentro do retangulo de Alagoas? */
export function isInAlagoas(latitude: number | null, longitude: number | null): boolean {
  if (!isRealNumber(latitude) || !isRealNumber(longitude)) return false;

  return (
    latitude >= ALAGOAS_BOUNDS.minLat &&
    latitude <= ALAGOAS_BOUNDS.maxLat &&
    longitude >= ALAGOAS_BOUNDS.minLng &&
    longitude <= ALAGOAS_BOUNDS.maxLng
  );
}

/**
 * Coordenada aceita para um Time DEMO.
 *
 * Recusa nula, NaN, `0,0` (a "ilha nula" no golfo da Guine, para onde vai
 * todo campo esquecido) e qualquer ponto fora de Alagoas. Deslocamento
 * aleatorio nao entra nesta conta porque deixou de existir: nenhuma
 * coordenada do Time DEMO e calculada.
 */
export function isUsableDemoCoordinate(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  if (!isRealNumber(latitude) || !isRealNumber(longitude)) return false;
  if (latitude === 0 && longitude === 0) return false;
  return isInAlagoas(latitude, longitude);
}
