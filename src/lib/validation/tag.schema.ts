import { z } from 'zod';
import { TAG_COLORS } from '@/lib/types';

/** Corpo de criar e editar uma tag. A limpeza fina e de `normalizarTag`. */
export const tagSchema = z.object({
  name: z.string().max(200),
  symbol: z.string().max(40).nullable().optional(),
  color: z.enum(TAG_COLORS),
  description: z.string().max(1000).nullable().optional(),
});

/** Colocar ou tirar uma tag de varias pessoas de uma vez. */
export const pessoasDaTagSchema = z.object({
  acao: z.enum(['colocar', 'tirar']),
  memberIds: z.array(z.string().uuid()).min(1).max(5000),
});
