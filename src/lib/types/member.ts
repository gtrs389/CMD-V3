import type { IsoDate, StoredImage, Timestamped } from './common';

/** Valor bruto de uma resposta, conforme o tipo do campo. */
export type FieldValue = string | number | boolean | string[] | null;

export interface FieldResponse {
  /** Referencia ao ID estavel do campo, nunca ao titulo. */
  fieldId: string;
  value: FieldValue;
}

export interface Member extends Timestamped {
  id: string;
  clientId: string;
  /** Nome completo (campo nativo). */
  name: string;
  /** Telefone normalizado, apenas digitos. */
  phone: string;
  photo: StoredImage | null;
  responses: FieldResponse[];
  /** Preenchido quando o formulario exigiu consentimento. */
  consentAt: IsoDate | null;
  /** Origem do cadastro: link publico ou painel administrativo. */
  source: 'invite' | 'admin';
}

export interface MemberInput {
  clientId: string;
  name: string;
  phone: string;
  photo: StoredImage | null;
  responses: FieldResponse[];
  consentAt: IsoDate | null;
  source: Member['source'];
}
