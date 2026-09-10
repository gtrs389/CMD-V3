import { z } from 'zod';
import { appConfig } from '@/config/app.config';
import { FIELD_TYPES } from '@/lib/types';

/**
 * Validacao de tudo que chega ao servidor.
 *
 * Nenhuma rota confia no navegador: o corpo de cada requisicao passa por um
 * destes esquemas antes de tocar no banco ou no Storage.
 */

/** Data URL de imagem ja comprimida, ou a URL assinada devolvida antes. */
const photoValue = z
  .string()
  .max(Math.ceil(appConfig.limits.maxStoredImageBytes * 1.4), 'Imagem muito grande.')
  .nullable();

const trimmed = (max: number) => z.string().trim().max(max);

export const clientCreateSchema = z.object({
  name: trimmed(80).min(2, 'Informe o nome do cliente.'),
  email: z.string().trim().min(1, 'Informe o e-mail.').pipe(z.email('E-mail invalido.')),
  photo: photoValue.default(null),
  notes: trimmed(500).default(''),
});

export const clientUpdateSchema = clientCreateSchema.partial();

const fieldOptionSchema = z.object({
  id: z.string().min(1).max(64),
  label: trimmed(80),
});

const customFieldSchema = z.object({
  id: z.string().min(1).max(64),
  systemKey: z.enum(['photo', 'name', 'phone']).nullable(),
  type: z.enum(FIELD_TYPES),
  label: trimmed(80),
  placeholder: trimmed(80),
  helpText: trimmed(160),
  required: z.boolean(),
  enabled: z.boolean(),
  order: z.number().int().min(0).max(999),
  options: z.array(fieldOptionSchema).max(appConfig.limits.maxOptionsPerField),
});

const privacySchema = z.object({
  enabled: z.boolean(),
  title: trimmed(80),
  text: trimmed(4000),
  requireConsent: z.boolean(),
  consentLabel: trimmed(200),
});

export const formUpdateSchema = z
  .object({
    fields: z.array(customFieldSchema).max(appConfig.limits.maxFieldsPerForm),
    privacy: privacySchema,
    introText: trimmed(1000),
    successMessage: trimmed(200),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nada para atualizar.');

export const inviteActiveSchema = z.object({ active: z.boolean() });

const fieldValueSchema = z.union([
  z.string().max(4000),
  z.number(),
  z.boolean(),
  z.array(z.string().max(200)).max(appConfig.limits.maxOptionsPerField),
  z.null(),
]);

const responsesSchema = z
  .array(z.object({ fieldId: z.string().min(1).max(64), value: fieldValueSchema }))
  .max(appConfig.limits.maxFieldsPerForm);

/** Campos comuns ao cadastro pelo painel e pelo link publico. */
const memberBase = {
  name: trimmed(120).min(2, 'Informe o nome completo.'),
  phone: trimmed(30).default(''),
  photo: photoValue.default(null),
  responses: responsesSchema.default([]),
  consentAt: z.iso.datetime().nullable().default(null),
};

export const memberCreateSchema = z.object({
  clientId: z.uuid('Cliente invalido.'),
  ...memberBase,
});

export const memberUpdateSchema = z
  .object({
    name: trimmed(120).min(2, 'Informe o nome completo.'),
    phone: trimmed(30),
    photo: photoValue,
    responses: responsesSchema,
    consentAt: z.iso.datetime().nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nada para atualizar.');

/** Envio pelo link publico: o cliente vem do token, nunca do corpo. */
export const publicSubmissionSchema = z.object(memberBase);

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type FormUpdateInput = z.infer<typeof formUpdateSchema>;
export type MemberCreateInput = z.infer<typeof memberCreateSchema>;
export type PublicSubmissionInput = z.infer<typeof publicSubmissionSchema>;
