import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { favoritosDe, marcarFavorito } from '@/lib/server/votacao.service';

/**
 * Marca ou desmarca um candidato como favorito de quem esta logado
 * (migration 057). Devolve a lista atualizada.
 */
const schema = z.object({
  ano: z.number().int().min(2000).max(2100),
  uf: z.string().regex(/^[A-Z]{2}$/),
  cargoCodigo: z.number().int().positive(),
  numero: z.string().regex(/^[0-9]{1,6}$/),
  favorito: z.boolean(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission('map.view');
    const { favorito, ...candidato } = await readJson(request, schema);
    await marcarFavorito(user.id, candidato, favorito);
    return jsonOk({ favoritos: await favoritosDe(user.id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
