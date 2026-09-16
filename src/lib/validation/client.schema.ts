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
  /**
   * Estado do time (migration 038). OBRIGATORIO.
   *
   * Vazio e a unica coisa que esta tela recusa aqui: a lista so oferece as
   * 27 siglas, entao nao ha como escolher um estado errado — so deixar de
   * escolher. O servidor confere de novo, contra a mesma lista, e o banco
   * repete no `check`.
   */
  stateUf: z.string().trim().min(1, 'Selecione o estado do time.'),
  /**
   * Municipios onde o time atua (migration 038). OPCIONAL, e varios: uma
   * operacao raramente cabe em um municipio so, e obrigar a escolher um
   * seria pedir uma resposta errada. Vazio quer dizer "nao restringiu".
   */
  cities: z.array(z.string().trim().min(1)),
  people: z.array(teamPersonSchema).min(1, 'Cadastre pelo menos um administrador do time.'),
});

export type TeamPersonFormValues = z.infer<typeof teamPersonSchema>;
export type ClientFormValues = z.infer<typeof clientSchema>;
