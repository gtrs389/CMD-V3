import { z } from 'zod';
import type { ClientFormConfig, CustomField, FieldResponse, FieldValue, Member } from '@/lib/types';
import { formatPhone, isValidPhone, normalizePhone } from '@/lib/utils/phone';
import {
  formatCpf,
  formatVoterId,
  genderLabel,
  isValidCpf,
  isValidVoterId,
  normalizeCpf,
  normalizePlace,
  normalizeSection,
  normalizeState,
  normalizeVoterId,
  normalizeZone,
  SECTION_MAX_LENGTH,
  ZONE_MAX_LENGTH,
} from '@/lib/utils/documents';

/**
 * Constroi validacao tipada a partir da configuracao de campos do cliente.
 *
 * As chaves do formulario sao sempre o ID interno do campo, nunca o titulo.
 * Assim, renomear um campo no construtor nao invalida respostas ja salvas.
 */

export const CONSENT_KEY = '__consent';

/** Valor manipulado pelos inputs. Sempre serializavel. */
export type DynamicValue = string | string[] | boolean | null;
export type DynamicFormValues = Record<string, DynamicValue>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER_PATTERN = /^-?\d+([.,]\d+)?$/;

export function visibleFields(config: ClientFormConfig): CustomField[] {
  return [...config.fields].filter((field) => field.enabled).sort((a, b) => a.order - b.order);
}

export function sortedFields(config: ClientFormConfig): CustomField[] {
  return [...config.fields].sort((a, b) => a.order - b.order);
}

function requiredMessage(field: CustomField): string {
  return field.type === 'photo' ? 'Envie uma imagem.' : `Preencha "${field.label}".`;
}

/**
 * Validacao propria dos campos padrao que tem regra brasileira.
 * Vazio continua valendo quando o campo e opcional.
 */
function systemValidator(field: CustomField): z.ZodType<DynamicValue> | null {
  const required = field.required;

  const texto = (checar: (valor: string) => string | null) =>
    z.string().superRefine((value, ctx) => {
      const trimmed = (value ?? '').trim();
      if (!trimmed) {
        if (required) ctx.addIssue({ code: 'custom', message: requiredMessage(field) });
        return;
      }
      const erro = checar(trimmed);
      if (erro) ctx.addIssue({ code: 'custom', message: erro });
    }) as z.ZodType<DynamicValue>;

  switch (field.systemKey) {
    case 'email':
      // O e-mail padrao e sempre obrigatorio: e ele que cria o acesso.
      return z.string().superRefine((value, ctx) => {
        const trimmed = (value ?? '').trim();
        if (!trimmed) {
          ctx.addIssue({ code: 'custom', message: 'Informe o e-mail.' });
          return;
        }
        if (!z.email().safeParse(trimmed.toLowerCase()).success) {
          ctx.addIssue({ code: 'custom', message: 'E-mail inválido.' });
        }
      }) as z.ZodType<DynamicValue>;
    case 'cpf':
      return texto((valor) => (isValidCpf(valor) ? null : 'CPF inválido. Confira os números.'));
    case 'voter_id':
      return texto((valor) =>
        isValidVoterId(valor) ? null : 'Título de eleitor inválido. Confira os números.',
      );
    case 'zone':
      return texto((valor) =>
        /^\d+$/.test(valor) && valor.length <= ZONE_MAX_LENGTH ? null : 'Zona eleitoral inválida.',
      );
    case 'section':
      return texto((valor) =>
        /^\d+$/.test(valor) && valor.length <= SECTION_MAX_LENGTH
          ? null
          : 'Seção eleitoral inválida.',
      );
    case 'state':
      return texto((valor) => (normalizeState(valor) ? null : 'Selecione um estado.'));
    case 'relationship':
      return texto((valor) =>
        field.options.some((opcao) => opcao.id === valor) ? null : 'Selecione uma opção.',
      );
    case 'city':
    case 'district':
    case 'street':
      return texto((valor) =>
        valor.length < 2 ? 'Use pelo menos 2 caracteres.' : valor.length > 120 ? 'Use no máximo 120 caracteres.' : null,
      );
    default:
      return null;
  }
}

function validatorFor(field: CustomField): z.ZodType<DynamicValue> {
  const required = field.required;

  const proprio = systemValidator(field);
  if (proprio) return proprio;

  switch (field.type) {
    case 'photo':
      return z
        .string()
        .nullable()
        .superRefine((value, ctx) => {
          if (required && !value) {
            ctx.addIssue({ code: 'custom', message: requiredMessage(field) });
          }
        }) as z.ZodType<DynamicValue>;

    case 'checkbox':
      return z.boolean().superRefine((value, ctx) => {
        if (required && value !== true) {
          ctx.addIssue({ code: 'custom', message: `Marque "${field.label}" para continuar.` });
        }
      }) as z.ZodType<DynamicValue>;

    case 'multiselect':
      return z.array(z.string()).superRefine((value, ctx) => {
        if (required && value.length === 0) {
          ctx.addIssue({ code: 'custom', message: 'Selecione pelo menos uma opção.' });
        }
      }) as z.ZodType<DynamicValue>;

    case 'select':
      return z.string().superRefine((value, ctx) => {
        if (required && !value) {
          ctx.addIssue({ code: 'custom', message: 'Selecione uma opção.' });
        }
      }) as z.ZodType<DynamicValue>;

    case 'phone':
      return z.string().superRefine((value, ctx) => {
        const trimmed = value.trim();
        if (!trimmed) {
          if (required) ctx.addIssue({ code: 'custom', message: requiredMessage(field) });
          return;
        }
        if (!isValidPhone(trimmed)) {
          ctx.addIssue({ code: 'custom', message: 'Telefone inválido. Use DDD + número.' });
        }
      }) as z.ZodType<DynamicValue>;

    case 'email':
      return z.string().superRefine((value, ctx) => {
        const trimmed = value.trim();
        if (!trimmed) {
          if (required) ctx.addIssue({ code: 'custom', message: requiredMessage(field) });
          return;
        }
        if (!z.email().safeParse(trimmed).success) {
          ctx.addIssue({ code: 'custom', message: 'E-mail inválido.' });
        }
      }) as z.ZodType<DynamicValue>;

    case 'number':
      return z.string().superRefine((value, ctx) => {
        const trimmed = value.trim();
        if (!trimmed) {
          if (required) ctx.addIssue({ code: 'custom', message: requiredMessage(field) });
          return;
        }
        if (!NUMBER_PATTERN.test(trimmed)) {
          ctx.addIssue({ code: 'custom', message: 'Informe apenas números.' });
        }
      }) as z.ZodType<DynamicValue>;

    case 'date':
      return z.string().superRefine((value, ctx) => {
        const trimmed = value.trim();
        if (!trimmed) {
          if (required) ctx.addIssue({ code: 'custom', message: requiredMessage(field) });
          return;
        }
        if (!DATE_PATTERN.test(trimmed) || Number.isNaN(new Date(trimmed).getTime())) {
          ctx.addIssue({ code: 'custom', message: 'Data inválida.' });
        }
      }) as z.ZodType<DynamicValue>;

    case 'textarea':
    case 'text':
    default:
      return z.string().superRefine((value, ctx) => {
        const trimmed = value.trim();
        if (required && !trimmed) {
          ctx.addIssue({ code: 'custom', message: requiredMessage(field) });
        }
        if (trimmed.length > 500) {
          ctx.addIssue({ code: 'custom', message: 'Use no máximo 500 caracteres.' });
        }
      }) as z.ZodType<DynamicValue>;
  }
}

export function buildDynamicSchema(config: ClientFormConfig): z.ZodType<DynamicFormValues> {
  const shape: Record<string, z.ZodType<DynamicValue>> = {};

  for (const field of visibleFields(config)) {
    shape[field.id] = validatorFor(field);
  }

  if (config.privacy.enabled && config.privacy.requireConsent) {
    shape[CONSENT_KEY] = z.boolean().superRefine((value, ctx) => {
      if (value !== true) {
        ctx.addIssue({ code: 'custom', message: 'E necessário aceitar para continuar.' });
      }
    }) as z.ZodType<DynamicValue>;
  }

  return z.object(shape).loose() as unknown as z.ZodType<DynamicFormValues>;
}

/** Valor inicial vazio de acordo com o tipo do campo. */
export function emptyValue(field: CustomField): DynamicValue {
  switch (field.type) {
    case 'photo':
      return null;
    case 'checkbox':
      return false;
    case 'multiselect':
      return [];
    default:
      return '';
  }
}

export function emptyValues(config: ClientFormConfig): DynamicFormValues {
  const values: DynamicFormValues = {};
  for (const field of visibleFields(config)) {
    values[field.id] = emptyValue(field);
  }
  if (config.privacy.enabled && config.privacy.requireConsent) {
    values[CONSENT_KEY] = false;
  }
  return values;
}

function toDynamic(field: CustomField, value: FieldValue): DynamicValue {
  if (value === null || value === undefined) return emptyValue(field);
  if (field.type === 'multiselect') return Array.isArray(value) ? value : [];
  if (field.type === 'checkbox') return value === true;
  if (field.type === 'photo') return typeof value === 'string' ? value : null;
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

/** Converte um integrante salvo em valores de formulario. */
export function valuesFromMember(config: ClientFormConfig, member: Member): DynamicFormValues {
  const values = emptyValues(config);
  const byId = new Map(member.responses.map((response) => [response.fieldId, response.value]));

  for (const field of visibleFields(config)) {
    if (field.systemKey === 'name') {
      values[field.id] = member.name;
    } else if (field.systemKey === 'phone') {
      values[field.id] = member.phone;
    } else if (field.systemKey === 'photo') {
      values[field.id] = member.photo;
    } else if (field.systemKey === 'gender') {
      values[field.id] = member.gender ?? '';
    } else if (field.systemKey === 'cpf') {
      values[field.id] = member.cpf ?? '';
    } else if (field.systemKey === 'voter_id') {
      values[field.id] = member.voterId ?? '';
    } else if (field.systemKey === 'zone') {
      values[field.id] = member.zone ?? '';
    } else if (field.systemKey === 'section') {
      values[field.id] = member.section ?? '';
    } else if (field.systemKey === 'state') {
      values[field.id] = member.state ?? '';
    } else if (field.systemKey === 'city') {
      values[field.id] = member.city ?? '';
    } else if (field.systemKey === 'district') {
      values[field.id] = member.district ?? '';
    } else if (field.systemKey === 'street') {
      values[field.id] = member.street ?? '';
    } else if (field.systemKey === 'relationship') {
      values[field.id] = member.relationshipOptionId ?? '';
    } else if (byId.has(field.id)) {
      values[field.id] = toDynamic(field, byId.get(field.id) ?? null);
    }
  }

  if (config.privacy.enabled && config.privacy.requireConsent) {
    values[CONSENT_KEY] = member.consentAt !== null;
  }

  return values;
}

function toStored(field: CustomField, value: DynamicValue): FieldValue {
  switch (field.type) {
    case 'photo':
      return typeof value === 'string' && value ? value : null;
    case 'checkbox':
      return value === true;
    case 'multiselect':
      return Array.isArray(value) ? value : [];
    case 'number': {
      const raw = typeof value === 'string' ? value.trim().replace(',', '.') : '';
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    }
    case 'phone':
      return typeof value === 'string' && value.trim() ? normalizePhone(value) : null;
    default: {
      const raw = typeof value === 'string' ? value.trim() : '';
      return raw ? raw : null;
    }
  }
}

export interface SubmissionPayload {
  name: string;
  /** Campo padrao obrigatorio: e com ele que o integrante entra no CMD. */
  phone: string;
  photo: string | null;
  gender: string | null;
  cpf: string | null;
  voterId: string | null;
  zone: string | null;
  section: string | null;
  state: string | null;
  city: string | null;
  district: string | null;
  street: string | null;
  relationshipOptionId: string | null;
  /** Nome da opcao no momento do envio. Reserva do historico. */
  relationshipLabel: string | null;
  responses: FieldResponse[];
  consentAt: string | null;
}

/**
 * Traduz os valores do formulario para o formato persistido.
 * Campos nativos alimentam as colunas do integrante; os demais viram respostas.
 */
export function toSubmission(
  config: ClientFormConfig,
  values: DynamicFormValues,
): SubmissionPayload {
  const payload: SubmissionPayload = {
    name: '',
    phone: '',
    photo: null,
    gender: null,
    cpf: null,
    voterId: null,
    zone: null,
    section: null,
    state: null,
    city: null,
    district: null,
    street: null,
    relationshipOptionId: null,
    relationshipLabel: null,
    responses: [],
    consentAt: null,
  };

  /** Texto do formulario, ja normalizado. Vazio vira nulo. */
  const texto = (value: DynamicValue): string => (typeof value === 'string' ? value.trim() : '');

  for (const field of visibleFields(config)) {
    const value = values[field.id];

    if (field.systemKey === 'name') {
      payload.name = typeof value === 'string' ? value.trim() : '';
      continue;
    }
    if (field.systemKey === 'phone') {
      payload.phone = typeof value === 'string' ? normalizePhone(value) : '';
      continue;
    }
    if (field.systemKey === 'photo') {
      payload.photo = typeof value === 'string' && value ? value : null;
      continue;
    }
    if (field.systemKey === 'gender') {
      payload.gender = texto(value) || null;
      continue;
    }
    if (field.systemKey === 'cpf') {
      payload.cpf = normalizeCpf(texto(value)) || null;
      continue;
    }
    if (field.systemKey === 'voter_id') {
      payload.voterId = normalizeVoterId(texto(value)) || null;
      continue;
    }
    if (field.systemKey === 'zone') {
      payload.zone = normalizeZone(texto(value)) || null;
      continue;
    }
    if (field.systemKey === 'section') {
      payload.section = normalizeSection(texto(value)) || null;
      continue;
    }
    if (field.systemKey === 'state') {
      payload.state = normalizeState(texto(value)) || null;
      continue;
    }
    if (field.systemKey === 'city') {
      payload.city = normalizePlace(texto(value)) || null;
      continue;
    }
    if (field.systemKey === 'district') {
      payload.district = normalizePlace(texto(value)) || null;
      continue;
    }
    if (field.systemKey === 'street') {
      payload.street = normalizePlace(texto(value)) || null;
      continue;
    }
    if (field.systemKey === 'relationship') {
      const escolhido = texto(value);
      const opcao = field.options.find((item) => item.id === escolhido);
      // Sem opcao correspondente o valor e descartado: o formulario so aceita
      // o que esta na lista do cliente.
      payload.relationshipOptionId = opcao ? opcao.id : null;
      payload.relationshipLabel = opcao ? opcao.label : null;
      continue;
    }

    // Campo personalizado: vira resposta. Campo padrao nunca chega aqui.
    payload.responses.push({ fieldId: field.id, value: toStored(field, value) });
  }

  if (config.privacy.enabled && config.privacy.requireConsent && values[CONSENT_KEY] === true) {
    payload.consentAt = new Date().toISOString();
  }

  return payload;
}

/** Texto legivel de uma resposta, usado nas fichas e listagens. */
export function formatResponse(field: CustomField, value: FieldValue): string {
  if (value === null || value === undefined || value === '') return '--';

  switch (field.type) {
    case 'checkbox':
      return value === true ? 'Sim' : 'Não';
    case 'multiselect': {
      if (!Array.isArray(value) || value.length === 0) return '--';
      const labels = value.map(
        (id) => field.options.find((option) => option.id === id)?.label ?? id,
      );
      return labels.join(', ');
    }
    case 'select': {
      const option = field.options.find((item) => item.id === value);
      return option?.label ?? String(value);
    }
    case 'date': {
      const date = new Date(String(value));
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    }
    default:
      return String(value);
  }
}

/** Campo com algum valor informado. Vazio, `null` e lista vazia nao contam. */
export function isFilled(value: DynamicValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return value;
  return true;
}

/**
 * Quanto do formulario ja foi preenchido, de 0 a 100.
 *
 * Conta os campos visiveis, obrigatorios ou nao: o numero serve para a pessoa
 * enxergar o proprio avanco, nao para decidir se o envio e aceito — quem
 * decide isso e a validacao, no envio.
 */
export function completionPercent(config: ClientFormConfig, values: DynamicFormValues): number {
  const fields = visibleFields(config);
  if (fields.length === 0) return 0;

  const preenchidos = fields.filter((field) => isFilled(values[field.id])).length;
  return Math.round((preenchidos / fields.length) * 100);
}

/** Quantos campos de uma lista ja tem valor. Usado no avanco por secao. */
export function filledCount(fields: CustomField[], values: DynamicFormValues): number {
  return fields.filter((field) => isFilled(values[field.id])).length;
}

/**
 * Campos obrigatorios que ainda faltam, incluindo o aceite do aviso.
 *
 * Numero de leitura, para a pessoa saber quanto falta. Quem decide se o
 * envio e aceito continua sendo a validacao, no envio.
 */
/**
 * Ate onde o preenchimento esta liberado.
 *
 * O formulario publico e preenchido NA ORDEM, um campo por vez: o proximo so
 * abre quando o anterior ja foi resolvido. O corte e o PRIMEIRO campo ainda
 * nao resolvido — quem decide o que conta como resolvido e quem chama, pela
 * funcao `isResolved`, porque um campo obrigatorio so se resolve
 * preenchendo, e um opcional tambem se resolve ao ser dispensado.
 *
 * Devolve o indice do ultimo campo liberado. Com tudo resolvido, devolve o
 * tamanho da lista: nada fica travado.
 *
 * `fields` precisa estar na MESMA ordem em que a tela desenha.
 */
export function unlockedUpTo(
  fields: readonly CustomField[],
  isResolved: (field: CustomField) => boolean,
): number {
  const travado = fields.findIndex((field) => !isResolved(field));
  return travado === -1 ? fields.length : travado;
}

export function missingRequired(config: ClientFormConfig, values: DynamicFormValues): number {
  const faltando = visibleFields(config).filter(
    (field) => field.required && !isFilled(values[field.id]),
  ).length;

  const { privacy } = config;
  const aceite = privacy.enabled && privacy.requireConsent && values[CONSENT_KEY] !== true ? 1 : 0;

  return faltando + aceite;
}

/**
 * Texto de leitura de um valor ainda em preenchimento.
 *
 * Usado na revisao e na confirmacao final do formulario publico: mostra
 * exatamente o que a pessoa informou, ja formatado (telefone, CPF, titulo e
 * genero), sem nada normalizado pela metade.
 */
export function formatFilledValue(field: CustomField, raw: DynamicValue | undefined): string {
  if (field.type === 'photo') return raw ? 'Foto enviada' : '--';

  const value = typeof raw === 'boolean' || Array.isArray(raw) ? raw : (raw ?? '');

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '--';

    if (field.systemKey === 'phone' || field.type === 'phone') return formatPhone(trimmed);
    if (field.systemKey === 'cpf') return formatCpf(trimmed);
    if (field.systemKey === 'voter_id') return formatVoterId(trimmed);
    if (field.systemKey === 'gender') return genderLabel(trimmed) ?? trimmed;
  }

  return formatResponse(field, value as FieldValue);
}
