import type { IsoDate, StoredImage, Timestamped } from './common';
import type { AccessStatus, Recruiter } from './user';

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
  /**
   * E-mail de acesso ao CMD. Minusculo, sem espacos e unico no sistema.
   * Nulo apenas nos integrantes anteriores ao campo padrao.
   */
  email: string | null;
  photo: StoredImage | null;
  /** Codigo do genero autodeclarado. Nulo quando nao informado. */
  gender: string | null;
  /** Somente digitos. Unico dentro do mesmo cliente. */
  cpf: string | null;
  /** Doze digitos. Unico dentro do mesmo cliente. */
  voterId: string | null;
  /** Zona eleitoral. Preenchida pela consulta do titulo de eleitor. */
  zone: string | null;
  /** Secao eleitoral. Preenchida pela consulta do titulo de eleitor. */
  section: string | null;
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
  /**
   * Quem cadastrou esta pessoa, determinado no servidor pelo dono do link.
   * Nulo somente nos registros anteriores ao rastreamento.
   */
  recruitedBy: Recruiter | null;
  /** Estado do acesso do proprio integrante ao CMD. */
  access: AccessStatus;
}

export interface MemberInput {
  clientId: string;
  name: string;
  phone: string;
  /** Obrigatorio nos cadastros novos: e o login do integrante. */
  email?: string | null;
  photo: StoredImage | null;
  /** Campos padrao opcionais: ausentes contam como nao informados. */
  gender?: string | null;
  cpf?: string | null;
  voterId?: string | null;
  zone?: string | null;
  section?: string | null;
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
