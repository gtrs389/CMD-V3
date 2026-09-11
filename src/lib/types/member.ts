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
  /** Codigo do genero autodeclarado. Nulo quando nao informado. */
  gender: string | null;
  /** Somente digitos. Unico dentro do mesmo cliente. */
  cpf: string | null;
  /** Doze digitos. Unico dentro do mesmo cliente. */
  voterId: string | null;
  /** Sigla da UF em maiusculas. */
  state: string | null;
  city: string | null;
  district: string | null;
  /** Nome da rua. Apenas o nome: nenhum identificador de API e guardado. */
  street: string | null;
  /** Opcao de vinculo escolhida, pelo identificador estavel. */
  relationshipOptionId: string | null;
  /** Nome da opcao no momento do cadastro. Reserva do historico. */
  relationshipLabel: string | null;
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
  /** Campos padrao opcionais: ausentes contam como nao informados. */
  gender?: string | null;
  cpf?: string | null;
  voterId?: string | null;
  state?: string | null;
  city?: string | null;
  district?: string | null;
  street?: string | null;
  relationshipOptionId?: string | null;
  relationshipLabel?: string | null;
  responses: FieldResponse[];
  consentAt: IsoDate | null;
  source: Member['source'];
}
