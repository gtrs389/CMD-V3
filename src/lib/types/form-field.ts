import type { IsoDate } from './common';

export const FIELD_TYPES = [
  'text',
  'textarea',
  'phone',
  'email',
  'number',
  'date',
  'select',
  'multiselect',
  'checkbox',
  'photo',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** Campos que existem em todo formulario e nao podem ser removidos. */
export const SYSTEM_FIELD_KEYS = [
  'photo',
  'name',
  'phone',
  'email',
  'gender',
  'cpf',
  'voter_id',
  'state',
  'city',
  'district',
  'street',
  'relationship',
] as const;
export type SystemFieldKey = (typeof SYSTEM_FIELD_KEYS)[number];

export interface FieldOption {
  /** Identificador estavel: renomear o rotulo nao quebra respostas salvas. */
  id: string;
  label: string;
  /** Usados apenas pelo campo padrao "Vinculo", que exibe cards. */
  icon?: string;
  color?: string;
}

export interface CustomField {
  /** ID interno estavel. Nunca muda, mesmo que o titulo seja editado. */
  id: string;
  /** Preenchido apenas nos campos nativos (foto, nome, telefone). */
  systemKey: SystemFieldKey | null;
  type: FieldType;
  label: string;
  placeholder: string;
  helpText: string;
  required: boolean;
  enabled: boolean;
  /** Posicao na tela publica. Menor valor aparece primeiro. */
  order: number;
  options: FieldOption[];
}

export interface PrivacyNotice {
  enabled: boolean;
  title: string;
  text: string;
  /** Exige marcar o consentimento antes de enviar. */
  requireConsent: boolean;
  consentLabel: string;
}

/** Configuracao do formulario publico de um cliente. */
export interface ClientFormConfig {
  fields: CustomField[];
  privacy: PrivacyNotice;
  /** Texto opcional exibido no topo do formulario publico. */
  introText: string;
  successMessage: string;
  updatedAt: IsoDate;
}
