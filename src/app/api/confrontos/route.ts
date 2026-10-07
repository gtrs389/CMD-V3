import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { enviarParaASala, escolasDaSala } from '@/lib/server/confronto.service';
import { candidatoSchema, lideresSchema, resumoSchema } from './schema';

/**
 * Sala de Confronto (migration 060): as escolas que o time mandou para o duelo.
 *
 * GET: o ADMIN ve todos os times (ou um, com `?clientId=`; `?clientId=` vazio
 * e o mapa geral); o Administrador do time ve sempre o proprio.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission('map.view');
    const pedido = request.nextUrl.searchParams.get('clientId');
    return jsonOk({ escolas: await escolasDaSala(user, pedido ?? undefined) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const envioSchema = z.object({
  clientId: z.string().max(100).nullable().optional(),
  chave: z.string().min(1).max(300),
  titulo: z.string().min(1).max(300),
  endereco: z.string().max(400).nullable(),
  cidade: z.string().max(120).nullable(),
  uf: z.string().max(2).nullable(),
  pinos: z.array(z.string().max(200)).max(200),
  esquerda: z.array(candidatoSchema).min(1).max(30),
  lideres: lideresSchema,
  recorte: z.object({
    leader: z.string().max(200).nullable().optional(),
    references: z.array(z.string().max(200)).max(50).optional(),
    section: z.string().max(40).nullable().optional(),
    rotulo: z.string().max(300).nullable().optional(),
  }),
  resumo: resumoSchema,
});

/** "Enviar para sala de confronto", do Raio-X da escola. Reenviar atualiza no lugar. */
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission('map.view');
    const envio = await readJson(request, envioSchema);
    return jsonOk({ escola: await enviarParaASala(user, envio) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
