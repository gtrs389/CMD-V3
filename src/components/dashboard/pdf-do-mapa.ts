import type { Member } from '@/lib/types';
import type { MapOverviewPayload, PlaceMember, PlaceMembersPayload, PollingPlacePin } from '@/lib/domain/map-pin';
import type { MapQuery } from '@/lib/domain/map-filters';
import { pessoasPorEscola, rankingDeLideres, rankingDeVotos } from '@/lib/domain/votos-por-lideranca';
import type { Confronto } from '@/lib/domain/confronto';
import { api } from '@/lib/repositories/http/api';
import { baixarArquivo } from '@/lib/utils/download';

/**
 * Os PDFs que saem do mapa, baixados de verdade (arquivo), e nao pela janela
 * de impressao. O gerador do PDF so e carregado no clique.
 */

/** Nome de arquivo sem acento nem espaco. */
function slug(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'local'
  );
}

/** Todas as pessoas que votam no local, pagina por pagina (o servidor limita a 50). */
async function todasAsPessoas(place: PollingPlacePin, clientId?: string): Promise<PlaceMember[]> {
  const pessoas: PlaceMember[] = [];
  for (let pagina = 1; pagina <= 200; pagina += 1) {
    const params = new URLSearchParams({ pagina: String(pagina), tamanho: '50' });
    if (clientId) params.set('time', clientId);
    const lote = await api<PlaceMembersPayload>(`/api/mapa/locais/${place.locationId}/integrantes?${params}`);
    pessoas.push(...lote.items);
    if (pessoas.length >= lote.total || lote.items.length === 0) break;
  }
  return pessoas;
}

/** "escola-estadual-prof-elza-soares.pdf": o nome da escola no arquivo. */
export async function baixarPdfDaEscola(place: PollingPlacePin, clientId?: string): Promise<void> {
  const [pessoas, { gerarPdfDaEscola }] = await Promise.all([
    todasAsPessoas(place, clientId),
    import('@/components/neo/MapaPdf'),
  ]);
  const blob = await gerarPdfDaEscola({ escola: place, pessoas, geradoEm: new Date().toISOString() });
  baixarArquivo(`${slug(place.title ?? 'local-de-votacao')}.pdf`, blob);
}

/** O recorte do mapa em palavras, para o PDF dizer de que pedaco ele fala. */
function recorteEmPalavras(query: MapQuery | null): string | null {
  if (!query) return null;
  const partes = [
    query.zone ? `Zona ${query.zone}` : null,
    query.city,
    query.state,
    query.minVotes > 0 ? `a partir de ${query.minVotes} votos` : null,
    query.search.trim() ? `busca "${query.search.trim()}"` : null,
  ].filter(Boolean);
  return partes.length ? partes.join(' · ') : null;
}

const dataDoArquivo = () => new Date().toISOString().slice(0, 10);

/** "Onde voce tem mais votos", com o mesmo recorte que esta na tela. */
export async function baixarPdfDoRankingDeVotos(
  places: readonly PollingPlacePin[],
  query: MapQuery | null,
  time: string,
): Promise<void> {
  const { gerarPdfDoRankingDeVotos } = await import('@/components/neo/MapaPdf');
  const blob = await gerarPdfDoRankingDeVotos({
    ranking: rankingDeVotos(places, query?.zone ?? null),
    filtro: recorteEmPalavras(query),
    geradoEm: new Date().toISOString(),
  });
  baixarArquivo(`onde-tem-mais-votos_${slug(time)}_${dataDoArquivo()}.pdf`, blob);
}

/**
 * A votacao oficial de um candidato (TSE): locais, zonas e secoes, com o
 * mesmo recorte do mapa. Entram tambem as escolas sem coordenada, que nao
 * viram pino mas tiveram voto.
 */
export async function baixarPdfDaVotacao(
  places: readonly PollingPlacePin[],
  query: MapQuery | null,
  candidato: { rotulo: string; nome: string; numero: string },
): Promise<void> {
  const { gerarPdfDoRankingDeVotos } = await import('@/components/neo/MapaPdf');
  const blob = await gerarPdfDoRankingDeVotos({
    ranking: rankingDeVotos(places, query?.zone ?? null),
    filtro: recorteEmPalavras(query),
    geradoEm: new Date().toISOString(),
    votacao: candidato.rotulo,
  });
  baixarArquivo(`votacao_${slug(candidato.nome)}-${candidato.numero}_${dataDoArquivo()}.pdf`, blob);
}

/**
 * Quem vota em cada local do ranking: a pessoa, a zona, a secao e o Lider.
 *
 * As pessoas vem da mesma lista do "Ver pessoas", local por local — poucos
 * de cada vez, para nao despejar centenas de pedidos de uma vez no servidor.
 */
export async function baixarPdfDasPessoasPorEscola(
  places: readonly PollingPlacePin[],
  query: MapQuery | null,
  time: string,
  clientId?: string,
): Promise<void> {
  const ranking = rankingDeVotos(places, query?.zone ?? null);
  const [porLocal, { gerarPdfDasPessoasPorEscola }] = await Promise.all([
    pessoasDosLocais(ranking.escolas.map((e) => e.place), clientId),
    import('@/components/neo/MapaPdf'),
  ]);
  const blob = await gerarPdfDasPessoasPorEscola({
    lista: pessoasPorEscola(ranking, porLocal, query?.zone ?? null),
    filtro: recorteEmPalavras(query),
    geradoEm: new Date().toISOString(),
  });
  baixarArquivo(`quem-vota-em-cada-local_${slug(time)}_${dataDoArquivo()}.pdf`, blob);
}

/** As pessoas de varios locais, com no maximo `simultaneos` pedidos no ar. */
async function pessoasDosLocais(
  places: readonly PollingPlacePin[],
  clientId?: string,
  simultaneos = 6,
): Promise<Map<string, PlaceMember[]>> {
  const porLocal = new Map<string, PlaceMember[]>();
  let proximo = 0;
  async function trabalhar() {
    while (proximo < places.length) {
      const place = places[proximo];
      proximo += 1;
      porLocal.set(place.locationId, await todasAsPessoas(place, clientId));
    }
  }
  await Promise.all(Array.from({ length: Math.min(simultaneos, places.length) }, trabalhar));
  return porLocal;
}

/**
 * Ranking dos Lideres, e de cada um: onde a Equipe vota. As escolas vem do
 * mapa do time (a secao do cadastro aponta o local), lido na hora do clique.
 */
export async function baixarPdfDoRankingDeLideres({
  time,
  clientId,
  members,
}: {
  time: string;
  clientId: string;
  members: readonly Member[];
}): Promise<void> {
  const [mapa, { gerarPdfDoRankingDeLideres }] = await Promise.all([
    api<MapOverviewPayload>(`/api/mapa?clientId=${encodeURIComponent(clientId)}`),
    import('@/components/neo/MapaPdf'),
  ]);
  const blob = await gerarPdfDoRankingDeLideres({
    ranking: rankingDeLideres(members, mapa.pollingPlaces),
    geradoEm: new Date().toISOString(),
  });
  baixarArquivo(`ranking-dos-lideres_${slug(time)}_${dataDoArquivo()}.pdf`, blob);
}

/**
 * Estimativa x apuracao: todas as escolas do time com o candidato escolhido
 * — o que o time esperava e o que o candidato teve, escola, zona e secao.
 */
export async function baixarPdfDoConfronto({
  confronto,
  candidato,
  time,
  query,
  andamento,
}: {
  confronto: Confronto;
  candidato: { rotulo: string; nome: string; numero: string };
  time: string;
  query: MapQuery | null;
  andamento: string | null;
}): Promise<void> {
  const { gerarPdfDoConfronto } = await import('@/components/neo/ConfrontoPdf');
  const blob = await gerarPdfDoConfronto({
    confronto,
    candidato: candidato.rotulo,
    time,
    filtro: recorteEmPalavras(query),
    andamento,
    geradoEm: new Date().toISOString(),
  });
  baixarArquivo(`estimativa-x-apuracao_${slug(candidato.nome)}-${candidato.numero}_${slug(time)}_${dataDoArquivo()}.pdf`, blob);
}
