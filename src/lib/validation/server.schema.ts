import { z } from "zod";
import { appConfig } from "@/config/app.config";
import { FIELD_TYPES, SYSTEM_FIELD_KEYS } from "@/lib/types";
import {
  GENDER_VALUES,
  SECTION_MAX_LENGTH,
  UF_OPTIONS,
  ZONE_MAX_LENGTH,
  isValidCpf,
  isValidVoterId,
} from "@/lib/utils/documents";
import { isValidPhone } from "@/lib/utils/phone";

/**
 * Validacao de tudo que chega ao servidor.
 *
 * Nenhuma rota confia no navegador: o corpo de cada requisicao passa por um
 * destes esquemas antes de tocar no banco ou no Storage.
 */

/** Data URL de imagem ja comprimida, ou a URL assinada devolvida antes. */
const photoValue = z
  .string()
  .max(
    Math.ceil(appConfig.limits.maxStoredImageBytes * 1.4),
    "Imagem muito grande.",
  )
  .nullable();

const trimmed = (max: number) => z.string().trim().max(max);

/**
 * Pessoa do time: registro interno do ADMIN, sem relacao com integrantes
 * recrutados nem com acesso ao sistema. `id` ausente indica pessoa nova.
 */
const MAX_TEAM_PEOPLE = 200;

const teamPersonSchema = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  name: trimmed(120).min(2, "Informe o nome da pessoa."),
  phone: trimmed(30)
    .min(1, "Informe o telefone.")
    .refine((value) => isValidPhone(value), "Telefone inválido."),
  photo: photoValue,
});

/**
 * Cadastro do time.
 *
 * Sem e-mail: quem entra no painel do time e sempre um administrador, pelo
 * link do time + telefone. Por isso todo time novo precisa de pelo menos um.
 */
export const clientCreateSchema = z.object({
  name: trimmed(80).min(2, "Informe o nome do time."),
  photo: photoValue.default(null),
  notes: trimmed(500).default(""),
  people: z
    .array(teamPersonSchema)
    .min(1, "Cadastre pelo menos um administrador do time.")
    .max(MAX_TEAM_PEOPLE),
});

/**
 * Estampa do banner: tudo em porcentagem da propria imagem.
 *
 * Os limites repetem os `check` da migration 022 — a tela nunca e a unica
 * barreira, e o banco recusa de novo o que passar daqui.
 */
export const bannerTagSchema = z.object({
  left: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  top: z.number().min(0).max(100),
  size: z.number().min(0.3).max(20),
  color: z
    .string()
    .trim()
    .regex(
      /^#[0-9a-fA-F]{6}$/,
      "Informe uma cor em hexadecimal, como #0b5c2c.",
    ),
});

export const clientUpdateSchema = clientCreateSchema
  .partial()
  .extend({ bannerTag: bannerTagSchema.optional() });

const fieldOptionSchema = z.object({
  id: z.string().min(1).max(64),
  label: trimmed(80),
});

const customFieldSchema = z
  .object({
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
    // Migration 025: o mesmo campo no link da equipe. Opcional para nao
    // recusar um envio de antes da separacao — nesse caso ele segue o link do
    // administrador, como sempre seguiu.
    requiredEquipe: z.boolean().optional(),
    enabledEquipe: z.boolean().optional(),
    order: z.number().int().min(0).max(999),
    options: z
      .array(fieldOptionSchema)
      .max(appConfig.limits.maxOptionsPerField),
  })
  // Ausentes, os dois seguem o link do administrador: e o que valia antes de
  // os links terem formularios separados.
  .transform((field) => ({
    ...field,
    requiredEquipe: field.requiredEquipe ?? field.required,
    enabledEquipe: field.enabledEquipe ?? field.enabled,
  }));

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
  .refine((value) => Object.keys(value).length > 0, "Nada para atualizar.");

export const inviteActiveSchema = z.object({ active: z.boolean() });

const fieldValueSchema = z.union([
  z.string().max(4000),
  z.number(),
  z.boolean(),
  z.array(z.string().max(200)).max(appConfig.limits.maxOptionsPerField),
  z.null(),
]);

const responsesSchema = z
  .array(
    z.object({ fieldId: z.string().min(1).max(64), value: fieldValueSchema }),
  )
  .max(appConfig.limits.maxFieldsPerForm);

const UF_CODES = UF_OPTIONS.map((option) => option.id) as [string, ...string[]];

/** Vazio conta como nao informado, e nao como valor invalido. */
const opcional = <T extends z.ZodType>(schema: T) =>
  z
    .union([schema, z.literal(""), z.null()])
    .optional()
    .transform((value) => (value === "" || value === undefined ? null : value));

/** Campos padrao com regra brasileira. Todos opcionais. */
const standardMemberFields = {
  gender: opcional(z.enum(GENDER_VALUES)),
  cpf: opcional(
    z
      .string()
      .trim()
      .max(20)
      .refine((value) => isValidCpf(value), "CPF inválido."),
  ),
  voterId: opcional(
    z
      .string()
      .trim()
      .max(20)
      .refine((value) => isValidVoterId(value), "Título de eleitor inválido."),
  ),
  zone: opcional(
    z
      .string()
      .trim()
      .regex(/^\d+$/, "Zona eleitoral inválida.")
      .max(ZONE_MAX_LENGTH, "Zona eleitoral inválida."),
  ),
  section: opcional(
    z
      .string()
      .trim()
      .regex(/^\d+$/, "Seção eleitoral inválida.")
      .max(SECTION_MAX_LENGTH, "Seção eleitoral inválida."),
  ),
  state: opcional(z.string().trim().toUpperCase().pipe(z.enum(UF_CODES))),
  city: opcional(z.string().trim().min(2, "Município muito curto.").max(120)),
  district: opcional(z.string().trim().min(2, "Bairro muito curto.").max(120)),
  street: opcional(z.string().trim().min(2, "Rua muito curta.").max(120)),
  relationshipOptionId: opcional(
    z
      .string()
      .trim()
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
  ),
  relationshipLabel: opcional(z.string().trim().min(1).max(80)),
};

/**
 * Telefone do integrante: campo padrao obrigatorio.
 *
 * E ele que identifica a pessoa no acesso pelo link do time, entao precisa
 * existir e ser valido. A normalizacao (somente digitos) acontece no
 * servico, antes de gravar e antes de qualquer comparacao.
 *
 * O e-mail saiu do cadastro: o integrante nao tem endereco nem senha. Os
 * enderecos ja gravados sao preservados, mas nao autenticam ninguem.
 */
const memberPhone = trimmed(30)
  .min(1, "Informe o telefone.")
  .refine((value) => isValidPhone(value), "Telefone inválido.");

/** Campos comuns ao cadastro pelo painel e pelo link publico. */
const memberBase = {
  ...standardMemberFields,
  name: trimmed(120).min(2, "Informe o nome completo."),
  phone: memberPhone,
  photo: photoValue.default(null),
  responses: responsesSchema.default([]),
  consentAt: z.iso.datetime().nullable().default(null),
};

export const memberCreateSchema = z.object({
  clientId: z.uuid("Time inválido."),
  ...memberBase,
});

export const memberUpdateSchema = z
  .object({
    ...standardMemberFields,
    name: trimmed(120).min(2, "Informe o nome completo."),
    phone: memberPhone,
    photo: photoValue,
    responses: responsesSchema,
    consentAt: z.iso.datetime().nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nada para atualizar.");

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

/**
 * Acesso pelo link do time: apenas o telefone.
 *
 * Atende os dois perfis daquele time — Administrador do time e membro da
 * equipe. O token vem da propria URL e nunca do corpo; o telefone e
 * normalizado no servidor antes de qualquer comparacao.
 */
export const teamPhoneLoginSchema = z.object({
  phone: trimmed(30).min(1, "Informe o telefone."),
  /**
   * Sinais do aparelho, apenas para auditoria do vinculo. Quem autoriza o
   * acesso e a credencial secreta do cookie: nada daqui decide nada, e
   * qualquer campo fora desta lista e descartado.
   */
  device: deviceSignalsSchema.optional(),
});

/**
 * Complementacao dos sinais do aparelho do primeiro acesso ao convite.
 *
 * Reaproveita exatamente o mesmo esquema do restante do sistema: nenhum
 * campo novo e aceito. O convite e a reserva vem dos cookies `HttpOnly`,
 * nunca do corpo.
 */
const inviteClickSignalsSchema = deviceSignalsSchema
  .extend({
    /** Area visivel da pagina, em pixels. So existe no clique (migration 021). */
    viewportWidth: z.number().int().min(1).max(100000),
    viewportHeight: z.number().int().min(1).max(100000),
    /** Idiomas do navegador, ja juntados pela pagina. */
    languages: trimmed(128),
  })
  .partial();

export const inviteDeviceSignalsSchema = z.object({
  device: inviteClickSignalsSchema.optional(),
});

export type InviteClickSignalsInput = z.infer<typeof inviteClickSignalsSchema>;

/**
 * Comprovantes cifrados da confirmacao de CPF e titulo, feita durante o
 * preenchimento. Opacos para o navegador: ele so devolve o que recebeu.
 */
const verificationTokenSchema = z
  .string()
  .min(1)
  .max(4000)
  .nullable()
  .optional();

/** Confirmacao do CPF, durante o preenchimento do link publico. */
export const inviteCpfLookupSchema = z.object({
  cpf: z
    .string()
    .trim()
    .max(20)
    .refine((value) => isValidCpf(value), "CPF inválido."),
});

/** Confirmacao do titulo de eleitor: usa o token da confirmacao do CPF. */
export const inviteTseLookupSchema = z.object({
  cpfToken: z.string().min(1).max(4000).nullable(),
});

/** Envio pelo link publico: o cliente vem do token, nunca do corpo. */
export const publicSubmissionSchema = z.object({
  ...memberBase,
  device: deviceSignalsSchema.optional(),
  cpfToken: verificationTokenSchema,
  tseToken: verificationTokenSchema,
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
    unit: z.enum(["minutes", "hours", "days"]),
  }),
  team: z.object({
    amount: z.number().int().min(1).max(525_600),
    unit: z.enum(["minutes", "hours", "days"]),
  }),
});

export type InviteExpirationInputSchema = z.infer<
  typeof inviteExpirationSchema
>;

export type DeviceSignalsInput = z.infer<typeof deviceSignalsSchema>;

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type FormUpdateInput = z.infer<typeof formUpdateSchema>;
export type MemberCreateInput = z.infer<typeof memberCreateSchema>;
export type PublicSubmissionInput = z.infer<typeof publicSubmissionSchema>;

/* -------------------------------------------------------------------------
   Questionario do time (migration 023)
   ------------------------------------------------------------------------- */

/**
 * Pergunta do questionario.
 *
 * Sem `systemKey` e sem o tipo `photo`: toda pergunta e livre, e o
 * questionario nao recebe arquivo. O banco recusa `photo` de qualquer forma;
 * aqui a recusa chega com mensagem legivel.
 */
const surveyFieldSchema = z
  .object({
    id: z.string().min(1).max(64),
    // Sempre nulo, e aceito apenas para a tela poder reaproveitar o mesmo
    // editor de campos do formulario de cadastro sem montar outro objeto.
    systemKey: z.null().optional().default(null),
    type: z
      .enum(FIELD_TYPES)
      .refine((type) => type !== "photo", "O questionário não aceita imagem."),
    label: trimmed(80),
    placeholder: trimmed(80),
    helpText: trimmed(160),
    required: z.boolean(),
    enabled: z.boolean(),
    order: z.number().int().min(0).max(999),
    options: z
      .array(fieldOptionSchema)
      .max(appConfig.limits.maxOptionsPerField),
  })
  // O questionario tem UM link so: nao ha publico para separar aqui.
  .transform((field) => ({
    ...field,
    requiredEquipe: field.required,
    enabledEquipe: field.enabled,
  }));

/** Configuracao enviada pelo ADMIN geral. Tudo opcional: so o que mudou. */
export const surveyUpdateSchema = z
  .object({
    active: z.boolean(),
    title: z
      .string()
      .trim()
      .min(1, "O questionário precisa de um título.")
      .max(120),
    introText: trimmed(2000),
    successMessage: trimmed(400),
    fields: z.array(surveyFieldSchema).max(appConfig.limits.maxFieldsPerForm),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nada para atualizar.");

/**
 * Resposta enviada pelo link publico.
 *
 * Nome e telefone de quem respondeu, e nada mais: o time, o remetente e o
 * rotulo de cada pergunta sao resolvidos no servidor, a partir do token do
 * link.
 */
export const surveyAnswerSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(120),
  phone: z
    .string()
    .trim()
    .refine((value) => isValidPhone(value), "Telefone inválido."),
  answers: responsesSchema,
});

/**
 * Destino de quem chega ao dominio publico sem um link valido.
 *
 * Vazio desliga o redirecionamento. Preenchido, tem de ser um endereco
 * absoluto `http(s)`: qualquer outro esquema — `javascript:`, `data:` —
 * viraria um redirecionamento perigoso em uma tela que qualquer pessoa
 * abre. O banco confere de novo, no `check` da coluna.
 */
export const publicEntrySchema = z.object({
  redirectUrl: z
    .string()
    .trim()
    .max(2000)
    .refine(
      (value) => value === "" || /^https?:\/\/[^\s]+$/.test(value),
      "Informe um endereço completo, começando com http:// ou https://.",
    ),
});
