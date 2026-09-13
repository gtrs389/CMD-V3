import { PRECISION_LABELS, type LocationKind, type LocationPrecision } from './map-location';

/**
 * Pinos do mapa e agrupamento por proximidade.
 *
 * Modulo puro: a mesma regra vale no servidor, no navegador e nos testes.
 * Cada integrante continua contado individualmente dentro do grupo.
 */

export interface MapPin {
  memberId: string;
  memberName: string;
  memberPhoto: string | null;
  clientId: string;
  clientName: string;
  locationKind: LocationKind;
  latitude: number;
  longitude: number;
  /** Rua, na moradia; nome do local, no local de votacao. */
  place: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zone: string | null;
  section: string | null;
  /** Ate onde o endereco chegou: rua, bairro ou municipio. */
  precision: LocationPrecision;
  /** Somente quando cadastrados. Ausentes nao viram linha vazia na tela. */
  phone: string | null;
  email: string | null;
}

/**
 * Local de votacao agrupado.
 *
 * O pino representa a escola, nao uma pessoa: nenhum nome, telefone ou e-mail
 * aparece aqui. As contagens vem dos integrantes cadastrados no CMD.
 */
export interface PollingPlacePin {
  locationId: string;
  latitude: number;
  longitude: number;
  title: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  imageUrl: string | null;
  /** Cadastros com titulo confirmado que votam ali. Base da estimativa. */
  total: number;
  men: number;
  women: number;
  /** Outro, prefiro nao informar ou sem genero declarado. Fecha o total. */
  others: number;
  /**
   * A mesma estimativa, quebrada por zona e secao eleitoral.
   *
   * Uma escola atende varias secoes, e e a secao que decide onde cada
   * cabine fica e quantos mesarios a campanha precisa. Sem essa quebra, o
   * numero da escola nao diz onde a forca esta dentro dela.
   *
   * A soma das secoes fecha com o total: quem nao tem zona ou secao no
   * cadastro entra em uma linha propria, em vez de sumir da conta.
   */
  sections: SectionVotes[];
}

/** Votos de uma secao eleitoral dentro de um local de votacao. */
export interface SectionVotes {
  /** Zona eleitoral do cadastro. Nulo quando nao foi informado. */
  zone: string | null;
  /** Secao eleitoral do cadastro. Nulo quando nao foi informada. */
  section: string | null;
  total: number;
}

/**
 * Estimativa de votos da escola.
 *
 * Uma pessoa cadastrada que vota ali, um voto: o numero e a contagem de
 * cadastros cujo titulo de eleitor aponta para aquele local. Nada e projetado,
 * ponderado ou inferido — e "estimativa" porque cadastro nao e voto garantido,
 * nao porque exista modelo por tras.
 *
 * A regra mora aqui: o popup do mapa e o painel lateral mostram o mesmo
 * numero, com o mesmo nome, sempre.
 */
export const ESTIMATED_VOTES_LABEL = 'Estimativa de votos';

/** Explica de que o numero e feito, para ninguem ler como projecao. */
export const ESTIMATED_VOTES_HINT = 'Uma pessoa cadastrada que vota aqui, um voto';

export function estimatedVotes(place: Pick<PollingPlacePin, 'total'>): number {
  return place.total;
}

/** Composicao da estimativa por genero declarado. Sempre fecha o total. */
export function voteBreakdown(
  place: Pick<PollingPlacePin, 'men' | 'women' | 'others'>,
): { label: string; value: number }[] {
  return [
    { label: 'Homens', value: place.men },
    { label: 'Mulheres', value: place.women },
    { label: 'Não informado', value: place.others },
  ];
}

/** Rotulo da secao na tela. Sem zona nem secao, diz isso em vez de mentir. */
export function sectionLabel(row: Pick<SectionVotes, 'zone' | 'section'>): string {
  const partes: string[] = [];
  if (row.zone) partes.push(`Zona ${row.zone}`);
  if (row.section) partes.push(`Seção ${row.section}`);
  return partes.length > 0 ? partes.join(' · ') : 'Sem zona/seção informada';
}

/**
 * Chave de agrupamento de uma secao dentro da escola.
 *
 * Zona e secao sao guardadas como texto no cadastro, entao "07" e "7" sao a
 * mesma secao escrita de dois jeitos. Sem normalizar, a mesma secao
 * apareceria duas vezes na lista, com o voto dividido entre elas.
 */
export function sectionKey(row: Pick<SectionVotes, 'zone' | 'section'>): string {
  const limpa = (value: string | null) => {
    const texto = (value ?? '').trim().replace(/^0+(?=\d)/, '');
    return texto || '-';
  };
  return `${limpa(row.zone)}/${limpa(row.section)}`;
}

/**
 * As secoes de uma escola, da maior para a menor.
 *
 * Empate desempata pelo rotulo, para a lista nao trocar de ordem a cada
 * leitura. A linha sem zona/secao vai sempre para o fim: ela e o resto, nao
 * um resultado.
 */
export function sectionVotes(place: Pick<PollingPlacePin, 'sections'>): SectionVotes[] {
  return [...place.sections].sort((a, b) => {
    const semA = !a.zone && !a.section;
    const semB = !b.zone && !b.section;
    if (semA !== semB) return semA ? 1 : -1;
    if (b.total !== a.total) return b.total - a.total;
    return sectionLabel(a).localeCompare(sectionLabel(b), 'pt-BR', { numeric: true });
  });
}

/** Chave de agrupamento: place_id, senao data_id, senao coordenada + titulo. */
export function pollingPlaceKey(place: {
  placeId?: string | null;
  dataId?: string | null;
  latitude: number;
  longitude: number;
  title?: string | null;
}): string {
  if (place.placeId?.trim()) return `place:${place.placeId.trim()}`;
  if (place.dataId?.trim()) return `data:${place.dataId.trim()}`;

  const title = (place.title ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  return `geo:${place.latitude.toFixed(5)},${place.longitude.toFixed(5)}:${title}`;
}

/** Genero declarado no cadastro. O que a consulta externa devolveu nao entra. */
export function genderBucket(gender: string | null | undefined): 'men' | 'women' | 'others' {
  if (gender === 'HOMEM') return 'men';
  if (gender === 'MULHER') return 'women';
  return 'others';
}

export interface MapTotals {
  residence: number;
  pollingPlace: number;
  pending: number;
  notFound: number;
}

export interface MapOverviewPayload {
  /** Somente moradia: o local de votacao vem agrupado em `pollingPlaces`. */
  pins: MapPin[];
  pollingPlaces: PollingPlacePin[];
  totals: MapTotals;
}

/** Pessoa listada apenas depois do clique em "Ver pessoas". */
export interface PlaceMember {
  memberId: string;
  name: string;
  photo: string | null;
  clientId: string;
  clientName: string;
  /** Ausentes nao viram linha vazia: a tela simplesmente nao mostra. */
  phone: string | null;
  email: string | null;
  zone: string | null;
  section: string | null;
}

export interface PlaceMembersPayload {
  items: PlaceMember[];
  total: number;
  page: number;
  pageSize: number;
}

/** Filtro do cabecalho. A tela comeca em "Moradia". */
export const MAP_FILTERS = ['RESIDENCE', 'POLLING_PLACE', 'BOTH'] as const;
export type MapFilter = (typeof MAP_FILTERS)[number];

/** A tela abre mostrando os dois tipos: nada fica escondido por padrao. */
export const DEFAULT_MAP_FILTER: MapFilter = 'BOTH';

export const MAP_FILTER_LABELS: Record<MapFilter, string> = {
  RESIDENCE: 'Pessoas',
  POLLING_PLACE: 'Locais de votação',
  BOTH: 'Ambos',
};

export function filterPins(pins: MapPin[], filter: MapFilter): MapPin[] {
  if (filter === 'BOTH') return pins;
  return pins.filter((pin) => pin.locationKind === filter);
}

/** Aviso de precisao do ponto, para nunca sugerir a casa exata. */
export function precisionLabel(pin: MapPin): string {
  return PRECISION_LABELS[pin.precision] ?? PRECISION_LABELS.CITY;
}

/** Texto principal do popup, conforme o tipo do pino. */
export function pinLabel(pin: MapPin): string {
  return pin.place || (pin.locationKind === 'RESIDENCE' ? 'Rua não informada' : 'Local de votação');
}

export interface PinCluster {
  id: string;
  latitude: number;
  longitude: number;
  pins: MapPin[];
}

/**
 * Agrupa pontos proximos de acordo com o zoom.
 *
 * Quanto mais perto, menor a celula: em zoom alto cada pessoa aparece
 * sozinha; em zoom baixo, quem esta na mesma rua ou na mesma escola vira um
 * unico marcador com a contagem.
 */
export function clusterPins(pins: MapPin[], zoom: number): PinCluster[] {
  const size = cellSize(zoom);
  const groups = new Map<string, MapPin[]>();

  for (const pin of pins) {
    const key = `${Math.round(pin.latitude / size)}:${Math.round(pin.longitude / size)}:${pin.locationKind}`;
    const list = groups.get(key) ?? [];
    list.push(pin);
    groups.set(key, list);
  }

  return [...groups.entries()].map(([id, list]) => ({
    id,
    latitude: list.reduce((sum, pin) => sum + pin.latitude, 0) / list.length,
    longitude: list.reduce((sum, pin) => sum + pin.longitude, 0) / list.length,
    pins: list,
  }));
}

/** Lado da celula em graus. Cai pela metade a cada nivel de zoom. */
export function cellSize(zoom: number): number {
  const level = Math.min(Math.max(zoom, 1), 18);
  return 8 / 2 ** (level - 1);
}
