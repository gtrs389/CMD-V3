import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { LOTE_DE_CANDIDATOS, LOTE_DE_SECOES } from '@/lib/domain/votacao-tse';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { candidatosDaVotacao, favoritosDe, gravarCandidatos, gravarSecoes } from '@/lib/server/votacao.service';

/**
 * Votacao oficial do TSE (migration 054).
 *
 * GET: a lista de candidatos gravados, para o seletor do mapa. E resultado
 * publico de eleicao: quem ve o mapa ve a lista.
 *
 * POST: grava um lote da planilha, ja lida no navegador. Exclusivo do ADMIN
 * geral, como tudo que muda o que o mapa mostra para todos os times.
 */
export async function GET() {
  try {
    const user = await requirePermission('map.view');
    const [candidatos, favoritos] = await Promise.all([candidatosDaVotacao(), favoritosDe(user.id)]);
    return jsonOk({ candidatos, favoritos });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const uf = z.string().regex(/^[A-Z]{2}$/);
const texto = (max: number) => z.string().max(max).nullable();

const secaoSchema = z.object({
  ano: z.number().int().min(2000).max(2100),
  uf,
  zona: z.number().int().min(1).max(9999),
  secao: z.number().int().min(1).max(99999),
  municipioCodigo: z.number().int().positive().nullable(),
  municipio: texto(200),
  localNumero: z.number().int().min(0).nullable(),
  localNome: texto(400),
  localEndereco: texto(600),
});

const candidatoSchema = z.object({
  ano: z.number().int().min(2000).max(2100),
  turno: z.number().int().min(1).max(2),
  uf,
  cargoCodigo: z.number().int().positive(),
  cargo: z.string().min(1).max(120),
  numero: z.string().regex(/^[0-9]{1,6}$/),
  nome: z.string().min(1).max(300),
  tipo: z.enum(['CANDIDATO', 'LEGENDA', 'BRANCO', 'NULO']),
  total: z.number().int().min(0),
  secoes: z.array(z.tuple([z.number().int().positive(), z.number().int().positive(), z.number().int().positive()])),
});

const loteSchema = z.union([
  z.object({ tipo: z.literal('secoes'), linhas: z.array(secaoSchema).max(LOTE_DE_SECOES) }),
  z.object({ tipo: z.literal('candidatos'), linhas: z.array(candidatoSchema).max(LOTE_DE_CANDIDATOS) }),
]);

export async function POST(request: NextRequest) {
  try {
    await requirePermission('map.resolve');
    const lote = await readJson(request, loteSchema);
    if (lote.tipo === 'secoes') await gravarSecoes(lote.linhas);
    else await gravarCandidatos(lote.linhas);
    return jsonOk({ gravadas: lote.linhas.length });
  } catch (error) {
    return toErrorResponse(error);
  }
}
