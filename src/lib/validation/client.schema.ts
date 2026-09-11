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

/**
 * Cadastro do time.
 *
 * Sem e-mail: quem entra no painel do time e sempre um administrador, pelo
 * link do time + telefone. Por isso todo time precisa de pelo menos um.
 */
export const clientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe o nome do time.')
    .max(80, 'Use no máximo 80 caracteres.'),
  photo: z.string().nullable(),
  notes: z.string().trim().max(500, 'Use no máximo 500 caracteres.'),
  people: z.array(teamPersonSchema).min(1, 'Cadastre pelo menos um administrador do time.'),
});

export type TeamPersonFormValues = z.infer<typeof teamPersonSchema>;
export type ClientFormValues = z.infer<typeof clientSchema>;
