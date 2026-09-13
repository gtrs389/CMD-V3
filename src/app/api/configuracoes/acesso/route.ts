import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { publicEntrySchema } from '@/lib/validation/server.schema';
import { getPublicEntry, updatePublicEntry } from '@/lib/server/settings.service';

/**
 * Destino de quem chega ao dominio publico sem um link valido.
 *
 * Exclusivo do ADMIN: sem `settings.view` a leitura responde 403, e sem
 * `settings.manage` a gravacao tambem. Nada daqui aparece na resposta
 * publica do convite ou do questionario.
 */
export async function GET() {
  try {
    await requirePermission('settings.view');
    return jsonOk({ entry: await getPublicEntry() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requirePermission('settings.manage');
    const input = await readJson(request, publicEntrySchema);
    return jsonOk({ entry: await updatePublicEntry(input) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
