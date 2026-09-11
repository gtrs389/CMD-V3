import { z } from 'zod';
import { appConfig } from '@/config/app.config';
import { FIELD_TYPES, SYSTEM_FIELD_KEYS } from '@/lib/types';
import { GENDER_VALUES, UF_OPTIONS, isValidCpf, isValidVoterId } from '@/lib/utils/documents';

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
  name: trimmed(80).min(2, 'Informe o nome do candidato.'),
  email: z.string().trim().min(1, 'Informe o e-mail.').pipe(z.email('E-mail inválido.')),
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
  // O servidor preserva o `system_key` gravado: o valor enviado nunca troca
  // um campo padrao de lugar. A lista completa fica em SYSTEM_FIELD_KEYS.
  systemKey: z.enum(SYSTEM_FIELD_KEYS).nullable(),
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

const UF_CODES = UF_OPTIONS.map((option) => option.id) as [string, ...string[]];

/** Vazio conta como nao informado, e nao como valor invalido. */
const opcional = <T extends z.ZodType>(schema: T) =>
  z
    .union([schema, z.literal(''), z.null()])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value));

/** Campos padrao com regra brasileira. Todos opcionais. */
const standardMemberFields = {
  gender: opcional(z.enum(GENDER_VALUES)),
  cpf: opcional(
    z
      .string()
      .trim()
      .max(20)
      .refine((value) => isValidCpf(value), 'CPF inválido.'),
  ),
  voterId: opcional(
    z
      .string()
      .trim()
      .max(20)
      .refine((value) => isValidVoterId(value), 'Título de eleitor inválido.'),
  ),
  state: opcional(z.string().trim().toUpperCase().pipe(z.enum(UF_CODES))),
  city: opcional(z.string().trim().min(2, 'Município muito curto.').max(120)),
  district: opcional(z.string().trim().min(2, 'Bairro muito curto.').max(120)),
  street: opcional(z.string().trim().min(2, 'Rua muito curta.').max(120)),
  relationshipOptionId: opcional(z.string().trim().max(64).regex(/^[A-Za-z0-9_-]+$/)),
  relationshipLabel: opcional(z.string().trim().min(1).max(80)),
};

/**
 * E-mail do integrante: campo padrao, obrigatorio e normalizado.
 *
 * Chega sempre em minusculas e sem espaco nas pontas, porque e ele que cria
 * o acesso e precisa bater com o que esta gravado.
 */
const memberEmail = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Informe o e-mail.')
  .max(254, 'E-mail muito longo.')
  .pipe(z.email('E-mail inválido.'));

/** Campos comuns ao cadastro pelo painel e pelo link publico. */
const memberBase = {
  ...standardMemberFields,
  name: trimmed(120).min(2, 'Informe o nome completo.'),
  email: memberEmail,
  phone: trimmed(30).default(''),
  photo: photoValue.default(null),
  responses: responsesSchema.default([]),
  consentAt: z.iso.datetime().nullable().default(null),
};

export const memberCreateSchema = z.object({
  clientId: z.uuid('Candidato inválido.'),
  ...memberBase,
});

export const memberUpdateSchema = z
  .object({
    ...standardMemberFields,
    name: trimmed(120).min(2, 'Informe o nome completo.'),
    email: memberEmail,
    phone: trimmed(30),
    photo: photoValue,
    responses: responsesSchema,
    consentAt: z.iso.datetime().nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nada para atualizar.');

/**
 * Sinais tecnicos do aparelho enviados pela pagina publica.
 *
 * Tudo opcional: a ausencia de qualquer campo nunca impede o cadastro.
 * O que vem de cabecalho (User-Agent, Client Hints, IP, geo) e lido no
 * servidor e nao entra neste esquema.
 */
export const deviceSignalsSchema = z
  .object({
    platform: trimmed(64),
    isMobile: z.boolean(),
    language: trimmed(32),
    timezone: trimmed(64),
    screenWidth: z.number().int().min(1).max(100000),
    screenHeight: z.number().int().min(1).max(100000),
    maxTouchPoints: z.number().int().min(0).max(64),
  })
  .partial();

/** Envio pelo link publico: o cliente vem do token, nunca do corpo. */
export const publicSubmissionSchema = z.object({
  ...memberBase,
  device: deviceSignalsSchema.optional(),
});

/**
 * Duracao dos links, enviada pelo ADMIN.
 *
 * Quantidade inteira e unidade fechada em uma lista: nenhum texto do usuario
 * chega perto de um intervalo SQL. A conversao para segundos acontece no
 * servidor, e o banco ainda confere os limites no proprio check da coluna.
 */
export const inviteExpirationSchema = z.object({
  candidate: z.object({
    amount: z.number().int().min(1).max(525_600),
    unit: z.enum(['minutes', 'hours', 'days']),
  }),
  team: z.object({
    amount: z.number().int().min(1).max(525_600),
    unit: z.enum(['minutes', 'hours', 'days']),
  }),
});

export type InviteExpirationInputSchema = z.infer<typeof inviteExpirationSchema>;

export type DeviceSignalsInput = z.infer<typeof deviceSignalsSchema>;

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type FormUpdateInput = z.infer<typeof formUpdateSchema>;
export type MemberCreateInput = z.infer<typeof memberCreateSchema>;
export type PublicSubmissionInput = z.infer<typeof publicSubmissionSchema>;
