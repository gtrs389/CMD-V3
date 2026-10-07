import { z } from 'zod';

/** Um candidato da votacao, como a lista do seletor traz (sem as secoes). */
export const candidatoSchema = z.object({
  id: z.string().min(1).max(200),
  ano: z.number().int().min(2000).max(2100),
  turno: z.number().int().min(1).max(2),
  uf: z.string().max(2),
  cargoCodigo: z.number().int(),
  cargo: z.string().max(120),
  numero: z.string().max(10),
  nome: z.string().max(200),
  tipo: z.enum(['CANDIDATO', 'LEGENDA', 'BRANCO', 'NULO']),
  total: z.number(),
  totalOficial: z.number().nullable(),
  sqcand: z.string().max(40).nullable().optional(),
});

export const lideresSchema = z.array(z.object({ id: z.string().min(1).max(200), nome: z.string().max(200) })).max(300);

export const resumoSchema = z.object({
  estimativa: z.number().optional(),
  secoes: z.number().optional(),
  zonas: z.array(z.string().max(10)).max(50).optional(),
  lideres: z.number().optional(),
  esquerda: z.number().optional(),
  direita: z.number().optional(),
  vitorias: z.object({ esquerda: z.number(), direita: z.number(), empate: z.number() }).optional(),
  apurado: z.array(z.number()).max(40).optional(),
});
