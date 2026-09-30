import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { sheetSettingsSchema } from '@/lib/validation/server.schema';
import { syncSheet, updateSheetSettings } from '@/lib/server/sheet-sync.service';
import { getClient } from '@/lib/server/client.service';

/**
 * Planilha do Google Sheets do time duplicado (migration 052). EXCLUSIVO do
 * ADMIN geral, e so em time duplicado — o servico recusa qualquer outro.
 *
 *   PATCH  liga/desliga e troca o link. Ligando, ja le a planilha.
 *   POST   le a planilha de novo, agora.
 */
export const maxDuration = 120;

async function exigirAdmin() {
  const user = await requirePermission('client.update');
  if (user.role !== 'ADMIN') throw forbidden();
  return user;
}

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/clients/[id]/planilha'>) {
  try {
    const user = await exigirAdmin();
    const { id } = await ctx.params;
    const input = await readJson(request, sheetSettingsSchema);

    await updateSheetSettings(id, input);

    // Ligou: a Equipe ja passa a vir da planilha. Se a leitura falhar, a
    // configuracao fica salva e o motivo volta para a tela.
    let erro: string | null = null;
    if (input.enabled) {
      try {
        await syncSheet(id, { id: user.id, name: user.name });
      } catch (falha) {
        erro = falha instanceof Error ? falha.message : 'Não foi possível ler a planilha.';
      }
    }

    return jsonOk({ client: await getClient(id), erro });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(_request: NextRequest, ctx: RouteContext<'/api/clients/[id]/planilha'>) {
  try {
    const user = await exigirAdmin();
    const { id } = await ctx.params;

    const report = await syncSheet(id, { id: user.id, name: user.name });
    return jsonOk({ report, client: await getClient(id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
