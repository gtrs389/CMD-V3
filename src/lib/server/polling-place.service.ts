import 'server-only';
import { TABLES, type ClientRow, type PollingPlaceRow } from '@/lib/supabase/tables';
import { selectOne, selectRows } from '@/lib/supabase/rest';
import { ENDERECO_FIXO } from '@/lib/domain/csv-import';
import type { LocalDeVotacao } from '@/lib/domain/onde-a-equipe-vota';

/**
 * Local de votacao a partir da tabela do TSE (migration 042).
 *
 * A escola onde a pessoa vota nao e mais uma pergunta a provedor nenhum: ela
 * esta no proprio banco, com a coordenada oficial. Consulta de graca,
 * instantanea e exata — e o mesmo local para todo mundo que vota nele.
 *
 * A SerpAPI continua servindo a MORADIA aproximada, que e o unico endereco
 * que ninguem publica em tabela: ele e digitado no cadastro.
 */

/**
 * Zona e secao digitadas ou devolvidas pela consulta eleitoral.
 *
 * "005" e "5" sao a mesma zona, e "0123" e a mesma secao que "123": o TSE
 * responde com zeros a frente, quem digita raramente os escreve, e a tabela
 * guarda numero. Normalizar aqui e o que faz os dois caminhos se encontrarem.
 */
function numero(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : null;

  const digitos = (value ?? '').replace(/\D/g, '');
  if (!digitos) return null;

  const convertido = Number.parseInt(digitos, 10);
  return Number.isFinite(convertido) && convertido > 0 ? convertido : null;
}

function sigla(value: string | null | undefined): string | null {
  const uf = (value ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(uf) ? uf : null;
}

export interface PollingPlaceQuery {
  /** Estado do domicilio eleitoral. Numero de zona se repete entre UFs. */
  uf: string | null | undefined;
  zone: string | number | null | undefined;
  section: string | number | null | undefined;
}

/**
 * Acha o local de votacao de UMA pessoa.
 *
 * A secao e a unidade: ela existe em um unico local, entao UF + zona + secao
 * devolvem uma linha so. Sem qualquer um dos tres nao ha busca — e melhor
 * ficar sem local do que apontar a escola errada para alguem.
 *
 * Nunca lanca: falha de leitura vira "nao encontrado", e o cadastro nunca
 * depende disto.
 */
export async function findPollingPlace(
  query: PollingPlaceQuery,
): Promise<PollingPlaceRow | null> {
  const uf = sigla(query.uf);
  const zone = numero(query.zone);
  const section = numero(query.section);

  if (!uf || !zone || !section) return null;

  return selectOne<PollingPlaceRow>(TABLES.pollingPlaces, {
    select: '*',
    // `cs` e "contem": a secao esta na lista daquele local. O indice GIN da
    // migration 042 responde direto, sem varrer a tabela.
    filters: { uf: `eq.${uf}`, zone: `eq.${zone}`, sections: `cs.{${section}}` },
  }).catch(() => null);
}

/**
 * Todos os locais de votacao de algumas zonas de uma UF, de uma vez.
 *
 * Usado pela planilha do Google Sheets do time duplicado (migration 052):
 * centenas de pessoas lidas ao vivo nao podem virar centenas de consultas.
 * Uma consulta traz os locais das zonas envolvidas, e a secao de cada pessoa
 * e procurada na memoria. So LEITURA: nada e gravado.
 */
export async function pollingPlacesOfZones(
  uf: string | null | undefined,
  zones: (string | number | null | undefined)[],
): Promise<PollingPlaceRow[]> {
  const estado = sigla(uf);
  const zonas = [...new Set(zones.map(numero).filter((zona): zona is number => zona !== null))];
  if (!estado || zonas.length === 0) return [];

  return selectRows<PollingPlaceRow>(TABLES.pollingPlaces, {
    select: '*',
    filters: { uf: `eq.${estado}`, zone: `in.(${zonas.join(',')})` },
  }).catch(() => []);
}

/** O local onde vota quem tem esta zona e secao, entre os ja lidos. */
export function pollingPlaceIn(
  places: PollingPlaceRow[],
  zone: string | number | null | undefined,
  section: string | number | null | undefined,
): PollingPlaceRow | null {
  const zona = numero(zone);
  const secao = numero(section);
  if (!zona || !secao) return null;
  return places.find((place) => place.zone === zona && place.sections.includes(secao)) ?? null;
}

/** Endereco de uma linha, como ele aparece no popup do mapa. */
export function pollingPlaceAddress(place: PollingPlaceRow): string | null {
  const partes = [
    place.address?.trim(),
    place.district?.trim(),
    [place.city?.trim(), place.uf].filter(Boolean).join(' - '),
  ].filter((parte): parte is string => Boolean(parte));

  return partes.length > 0 ? partes.join(', ') : null;
}

/**
 * Os locais das zonas pedidas, na UF do time (sem UF gravada, a do endereco
 * fixo), no formato que a tela usa (`LocalDeVotacao`).
 */
export async function locaisDasZonasDoTime(clientId: string, zonas: number[]): Promise<LocalDeVotacao[]> {
  if (zonas.length === 0) return [];
  const time = await selectOne<Pick<ClientRow, 'state_uf'>>(TABLES.clients, {
    select: 'state_uf',
    filters: { id: `eq.${clientId}` },
  }).catch(() => null);
  const linhas = await pollingPlacesOfZones(time?.state_uf ?? ENDERECO_FIXO.state, zonas);
  return linhas.map((place) => ({
    id: place.id,
    nome: place.name,
    endereco: pollingPlaceAddress(place),
    cidade: place.city,
    zona: place.zone,
    secoes: place.sections,
  }));
}
