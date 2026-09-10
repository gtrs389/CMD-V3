import { z } from 'zod';
import type { ClientFormConfig, CustomField, FieldResponse, FieldValue, Member } from '@/lib/types';
import { isValidPhone, normalizePhone } from '@/lib/utils/phone';

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

function validatorFor(field: CustomField): z.ZodType<DynamicValue> {
  const required = field.required;

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
  phone: string;
  photo: string | null;
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
    responses: [],
    consentAt: null,
  };

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
