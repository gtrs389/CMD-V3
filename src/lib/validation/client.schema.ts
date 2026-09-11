import { z } from 'zod';
import { isValidPhone } from '@/lib/utils/phone';

/**
 * Pessoa do time: registro interno do ADMIN, sem relacao com integrantes
 * recrutados pelo link nem com acesso ao sistema. `id` ausente indica
 * pessoa nova, ainda nao gravada.
 */
export const teamPersonSchema = z.object({
  id: z.string().optional(),
  name: z
    .string()
    .trim()
    .min(2, 'Informe o nome da pessoa.')
    .max(120, 'Use no máximo 120 caracteres.'),
  phone: z
    .string()
    .trim()
    .min(1, 'Informe o telefone.')
    .refine((value) => isValidPhone(value), 'Telefone inválido. Use DDD + número.'),
  photo: z.string().nullable(),
});

export const clientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe o nome do time.')
    .max(80, 'Use no máximo 80 caracteres.'),
  email: z
    .string()
    .trim()
    .min(1, 'Informe o e-mail.')
    .pipe(z.email('E-mail inválido.')),
  photo: z.string().nullable(),
  notes: z.string().trim().max(500, 'Use no máximo 500 caracteres.'),
  people: z.array(teamPersonSchema),
});

export type TeamPersonFormValues = z.infer<typeof teamPersonSchema>;
export type ClientFormValues = z.infer<typeof clientSchema>;
