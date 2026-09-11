import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import {
  ensureResidenceLinks,
  mapOverview,
  resolvePending,
  retryLocation,
} from '@/lib/server/map-location.service';

/**
 * Mapa da mobilizacao, somente para o ADMIN autenticado.
 *
 * A resposta carrega apenas o necessario para desenhar o pino e abrir a
 * ficha: nenhum CPF, telefone, endereco completo ou retorno de consulta.
 */
export async function GET(request: NextRequest) {
  try {
    await requirePermission('map.view');

    // Vinculos que faltam e pendentes ja resolvidos aqui, um de cada vez:
    // assim o mapa abre com o que existe, sem consultas em paralelo.
    await ensureResidenceLinks().catch(() => undefined);
    await resolvePending(5).catch(() => undefined);

    // Sem `clientId`, o mapa mostra a mobilizacao inteira (uso no painel
    // geral). Com `clientId`, mostra apenas a equipe daquele time
    // (uso no painel individual do time).
    const clientId = request.nextUrl.searchParams.get('clientId') ?? undefined;

    return jsonOk(await mapOverview(clientId));
  } catch (error) {
    return toErrorResponse(error);
  }
}

const actionSchema = z.union([
  z.object({ action: z.literal('pending') }),
  z.object({
    action: z.literal('retry'),
    memberId: z.string().min(1),
    kind: z.enum(['RESIDENCE', 'POLLING_PLACE']),
  }),
]);

/**
 * Localiza os cadastros pendentes ou repete um vinculo.
 * Cada consulta pode gerar cobranca: nada disso acontece sozinho.
 */
export async function POST(request: NextRequest) {
  try {
    await requirePermission('map.resolve');
    const input = await readJson(request, actionSchema);

    if (input.action === 'pending') {
      return jsonOk(await resolvePending());
    }

    await retryLocation(input.memberId, input.kind);
    return jsonOk({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
