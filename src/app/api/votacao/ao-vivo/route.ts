import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, toErrorResponse } from '@/lib/server/http';
import { coletarAoVivo, situacaoAoVivo } from '@/lib/server/votacao-ao-vivo.service';

/**
 * Votacao ao vivo pelos boletins de urna do TSE (migration 055).
 *
 * POST: faz uma coleta curta e devolve o andamento. Quem chama e o mapa, a
 * cada minuto, enquanto alguem olha a votacao. A trava no banco garante uma
 * coleta por vez, entao varias telas abertas nao multiplicam as consultas
 * ao TSE.
 *
 * GET: so o andamento. Com `Authorization: Bearer <CRON_SECRET>` (o que a
 * Vercel Cron e os agendadores externos mandam), coleta tambem — para a
 * apuracao andar mesmo sem ninguem com o mapa aberto.
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const segredo = process.env.CRON_SECRET?.trim();
    if (segredo && request.headers.get('authorization') === `Bearer ${segredo}`) {
      return jsonOk(await coletarAoVivo());
    }
    await requirePermission('map.view');
    return jsonOk(await situacaoAoVivo());
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST() {
  try {
    await requirePermission('map.view');
    return jsonOk(await coletarAoVivo());
  } catch (error) {
    return toErrorResponse(error);
  }
}
