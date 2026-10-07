import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/server/guard';
import { badRequest, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { NEO_ERRO_MENSAGEM, NeoFalhou, conversarNoConfronto } from '@/lib/server/neo.service';

/** A IA responde em segundos, mas pode passar do limite padrao da plataforma. */
export const maxDuration = 60;

const entradaSchema = z.object({
  pergunta: z.string().trim().min(1).max(600),
  historico: z.array(z.object({ autor: z.enum(['eu', 'neo']), texto: z.string().max(2000) })).max(12),
  contexto: z.unknown(),
});

/**
 * O chat do NEO na Sala de Confronto. O contexto (o radar da escola) chega
 * pronto do navegador: so numeros e nomes publicos. Sem a IA configurada,
 * devolve `neo: null` e o motivo — o chat segue com o radar sozinho.
 */
export async function POST(request: NextRequest) {
  try {
    await requirePermission('map.view');
    const entrada = await readJson(request, entradaSchema);
    if (JSON.stringify(entrada.contexto ?? null).length > 80_000) throw badRequest('Contexto grande demais.');
    try {
      return jsonOk({ neo: await conversarNoConfronto(entrada), erro: null });
    } catch (error) {
      const erro = error instanceof NeoFalhou ? NEO_ERRO_MENSAGEM[error.codigo] : NEO_ERRO_MENSAGEM.INDISPONIVEL;
      return jsonOk({ neo: null, erro });
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}
