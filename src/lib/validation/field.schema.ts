import { z } from 'zod';
import { appConfig } from '@/config/app.config';
import { FIELD_TYPES } from '@/lib/types';

const optionSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1, 'Informe o texto da opção.').max(80, 'Máximo de 80 caracteres.'),
});

export const OPTION_FIELD_TYPES = ['select', 'multiselect'] as const;

export function requiresOptions(type: string): boolean {
  return (OPTION_FIELD_TYPES as readonly string[]).includes(type);
}

export const fieldSchema = z
  .object({
    type: z.enum(FIELD_TYPES),
    label: z
      .string()
      .trim()
      .min(2, 'Informe o título do campo.')
      .max(80, 'Use no máximo 80 caracteres.'),
    placeholder: z.string().trim().max(80, 'Use no máximo 80 caracteres.'),
    helpText: z.string().trim().max(160, 'Use no máximo 160 caracteres.'),
    required: z.boolean(),
    enabled: z.boolean(),
    options: z
      .array(optionSchema)
      .max(appConfig.limits.maxOptionsPerField, 'Limite de opções atingido.'),
  })
  .superRefine((value, ctx) => {
    if (requiresOptions(value.type) && value.options.length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Cadastre pelo menos duas opções.',
      });
    }
    const labels = value.options.map((option) => option.label.trim().toLowerCase());
    if (new Set(labels).size !== labels.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Há opções repetidas.' });
    }
  });

export type FieldFormValues = z.infer<typeof fieldSchema>;

export const formSettingsSchema = z.object({
  introText: z.string().trim().max(400, 'Use no máximo 400 caracteres.'),
  successMessage: z
    .string()
    .trim()
    .min(2, 'Informe a mensagem de sucesso.')
    .max(200, 'Use no máximo 200 caracteres.'),
  privacyEnabled: z.boolean(),
  privacyTitle: z.string().trim().max(80, 'Use no máximo 80 caracteres.'),
  privacyText: z.string().trim().max(2000, 'Use no máximo 2000 caracteres.'),
  privacyRequireConsent: z.boolean(),
  privacyConsentLabel: z.string().trim().max(200, 'Use no máximo 200 caracteres.'),
});

export type FormSettingsValues = z.infer<typeof formSettingsSchema>;
