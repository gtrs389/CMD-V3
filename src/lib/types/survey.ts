import type { IsoDate } from './common';
import type { BannerTag } from './client';
import type { CustomField, FieldType } from './form-field';
import type { PublicInviteOwner } from './invite';
import type { FieldValue } from './member';
import type { Role } from './user';

/**
 * Questionario do time.
 *
 * E o SEGUNDO formulario do sistema, e nao se confunde com o de cadastro. O
 * de cadastro transforma quem responde em integrante da equipe; este aqui e
 * uma pesquisa que a equipe envia para OUTRAS PESSOAS. Quem responde nao
 * vira integrante, nao ganha acesso e nao entra em contagem nenhuma de
 * mobilizacao: a resposta fica guardada a parte, com o nome e o telefone de
 * quem respondeu.
 *
 * Regras que o tipo carrega:
 *
 *  - UM questionario por time. As perguntas moram no time;
 *  - quem monta as perguntas e somente o ADMIN geral;
 *  - o link e de uso unico, como o de cadastro.
 */
export interface SurveyConfig {
  /** Interruptor do time: em false nenhum link aceita resposta. */
  active: boolean;
  title: string;
  introText: string;
  successMessage: string;
  /** Perguntas, todas livres: questionario nao tem campo de sistema. */
  fields: CustomField[];
  updatedAt: IsoDate;
}

export const DEFAULT_SURVEY_TITLE = 'Questionário';
export const DEFAULT_SURVEY_SUCCESS = 'Obrigado por responder!';

/** O que o ADMIN pode alterar. Tudo opcional: a tela envia so o que mudou. */
export interface SurveyConfigInput {
  active?: boolean;
  title?: string;
  introText?: string;
  successMessage?: string;
  fields?: CustomField[];
}

/**
 * Uma pergunta respondida.
 *
 * `label` e `type` sao copias do momento do envio: renomear ou excluir a
 * pergunta depois nao muda o sentido do que ja foi respondido.
 */
export interface SurveyAnswer {
  /** Nulo quando a pergunta foi excluida depois da resposta. */
  fieldId: string | null;
  label: string;
  type: FieldType;
  value: FieldValue;
}

/** Resposta de uma pessoa. Nunca e um integrante. */
export interface SurveyResponse {
  id: string;
  clientId: string;
  name: string;
  /** Telefone normalizado, apenas digitos. */
  phone: string;
  /** Quem enviou o link. Snapshot: sobrevive a exclusao do usuario. */
  senderName: string | null;
  senderRole: Role | null;
  answeredAt: IsoDate;
  answers: SurveyAnswer[];
}

/**
 * O que a tela publica precisa saber para desenhar o questionario.
 *
 * Os campos de apresentacao sao os MESMOS do convite de cadastro — dono do
 * link, nome do time e estampa do banner —, porque a tela e a mesma: o que
 * muda e o que acontece com a resposta, nao o que a pessoa ve.
 */
export interface PublicSurvey {
  clientId: string;
  clientName: string;
  /** Estampa do banner do celular, ajustada pelo ADMIN (migration 022). */
  bannerTag: BannerTag;
  /** Quem enviou o link: apenas nome, foto e perfil. */
  owner: PublicInviteOwner | null;
  title: string;
  introText: string;
  successMessage: string;
  fields: CustomField[];
}
