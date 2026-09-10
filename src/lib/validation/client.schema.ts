import { z } from 'zod';

export const clientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe o nome do cliente.')
    .max(80, 'Use no maximo 80 caracteres.'),
  email: z
    .string()
    .trim()
    .min(1, 'Informe o e-mail.')
    .pipe(z.email('E-mail invalido.')),
  photo: z.string().nullable(),
  notes: z.string().trim().max(500, 'Use no maximo 500 caracteres.'),
});

export type ClientFormValues = z.infer<typeof clientSchema>;
