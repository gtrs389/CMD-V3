import type { PlaceMember, PlaceMembersPayload, PollingPlacePin } from '@/lib/domain/map-pin';
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
export async function baixarPdfDaEscola(place: PollingPlacePin, time: string, clientId?: string): Promise<void> {
  const [pessoas, { gerarPdfDaEscola }] = await Promise.all([
    todasAsPessoas(place, clientId),
    import('@/components/neo/MapaPdf'),
  ]);
  const blob = await gerarPdfDaEscola({ time, escola: place, pessoas, geradoEm: new Date().toISOString() });
  baixarArquivo(`${slug(place.title ?? 'local-de-votacao')}.pdf`, blob);
}
