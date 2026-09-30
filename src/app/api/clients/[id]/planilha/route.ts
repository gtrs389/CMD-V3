import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { sheetSettingsSchema } from '@/lib/validation/server.schema';
import { statusDaPlanilha, updateSheetSettings } from '@/lib/server/sheet-live.service';
import { getClient } from '@/lib/server/client.service';

/**
 * Planilha do Google Sheets do time duplicado (migration 052). EXCLUSIVO do
 * ADMIN geral, e so em time duplicado — o servico recusa qualquer outro.
 *
 *   GET    le a planilha (ao vivo) e diz o que ela tem: Lideres reconhecidos,
 *          criados, pessoas e o que ficou de fora. `?agora=1` vai ao Google
 *          sem pegar carona numa leitura ja em andamento.
 *   PATCH  liga/desliga e troca o link. So isso e gravado no banco.
 *
 * Nenhuma das duas grava dado da planilha: ela e lida, nunca importada.
 */
export const maxDuration = 60;

async function exigirAdmin() {
  const user = await requirePermission('client.update');
  if (user.role !== 'ADMIN') throw forbidden();
  return user;
}

export async function GET(request: NextRequest, ctx: RouteContext<'/api/clients/[id]/planilha'>) {
  try {
    await exigirAdmin();
    const { id } = await ctx.params;
    const naHora = request.nextUrl.searchParams.get('agora') === '1';
    return jsonOk({ report: await statusDaPlanilha(id, { naHora }) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/clients/[id]/planilha'>) {
  try {
    await exigirAdmin();
    const { id } = await ctx.params;
    const input = await readJson(request, sheetSettingsSchema);

    await updateSheetSettings(id, input);
    return jsonOk({ client: await getClient(id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
