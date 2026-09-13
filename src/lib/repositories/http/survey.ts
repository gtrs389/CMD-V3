import type {
  PublicSurvey,
  SurveyConfig,
  SurveyConfigInput,
  SurveyResponse,
} from '@/lib/types';
import type { FieldValue } from '@/lib/types';
import { api, GoneError } from './api';
import { notifyDataChanged } from '../events';

/**
 * Questionario do time, do lado do navegador.
 *
 * E o segundo formulario do sistema e nao se confunde com o de cadastro:
 * quem responde o questionario NAO vira integrante, nao ganha acesso e nao
 * entra em contagem nenhuma de mobilizacao.
 *
 * Nenhuma chamada daqui carrega token: no lado publico o codigo do link vive
 * em cookie `HttpOnly`, lido apenas no servidor.
 */

/* -------------------------------------------------------------------------
   Area autenticada
   ------------------------------------------------------------------------- */

/** Questionario de um time. Leitura do ADMIN geral e do Administrador do time. */
export async function fetchSurvey(clientId: string): Promise<SurveyConfig> {
  const { survey } = await api<{ survey: SurveyConfig }>(`/api/clients/${clientId}/questionario`);
  return survey;
}

/** Grava perguntas e ajustes. Exclusivo do ADMIN geral: a rota confere. */
export async function updateSurvey(
  clientId: string,
  input: SurveyConfigInput,
): Promise<SurveyConfig> {
  const { survey } = await api<{ survey: SurveyConfig }>(
    `/api/clients/${clientId}/questionario`,
    { method: 'PATCH', body: input },
  );
  notifyDataChanged();
  return survey;
}

/** Respostas recebidas pelo time. */
export async function fetchSurveyResponses(clientId: string): Promise<SurveyResponse[]> {
  const { responses } = await api<{ responses: SurveyResponse[] }>(
    `/api/clients/${clientId}/questionario/respostas`,
  );
  return responses;
}

/** Questionario e respostas do proprio perfil, ja recortados pelo servidor. */
export interface OwnSurvey {
  survey: SurveyConfig;
  responses: SurveyResponse[];
}

export async function fetchOwnSurvey(): Promise<OwnSurvey> {
  return api<OwnSurvey>('/api/questionario');
}

/**
 * Gera o link de uso unico do questionario.
 *
 * Sem `clientId`, o link e o do PROPRIO usuario. Com `clientId`, e o link do
 * time — o ADMIN geral gerando em nome do Administrador do time, como ja
 * acontece no link de cadastro.
 *
 * O token volta uma unica vez: o banco guarda apenas o hash.
 */
export async function generateSurveyLink(clientId?: string): Promise<string> {
  const path = clientId ? `/api/clients/${clientId}/questionario/link` : '/api/questionario/link';
  const { token } = await api<{ token: string }>(path, { method: 'POST' });
  return token;
}

/* -------------------------------------------------------------------------
   Lado publico
   ------------------------------------------------------------------------- */

/**
 * Resultado de abrir o link do questionario.
 *
 * `gone` cobre encerrado, ja respondido e reservado por outro navegador: o
 * servidor responde 410 sem distinguir os casos.
 */
export type PublicSurveyOutcome =
  | { kind: 'ready'; survey: PublicSurvey }
  | { kind: 'gone' }
  | { kind: 'unavailable' };

export async function fetchPublicSurvey(): Promise<PublicSurveyOutcome> {
  try {
    const { survey } = await api<{ survey: PublicSurvey | null }>('/api/public/questionario');
    if (!survey) return { kind: 'unavailable' };
    return { kind: 'ready', survey };
  } catch (error) {
    if (error instanceof GoneError) return { kind: 'gone' };
    throw error;
  }
}

export interface SurveySubmissionInput {
  name: string;
  phone: string;
  answers: { fieldId: string; value: FieldValue }[];
}

/**
 * Envio da resposta.
 *
 * O time de destino e o remetente vem do token do link, resolvidos no
 * servidor: o navegador nunca escolhe para onde a resposta vai.
 */
export async function submitSurvey(input: SurveySubmissionInput): Promise<void> {
  await api<{ ok: true }>('/api/public/questionario/resposta', {
    method: 'POST',
    body: input,
  });
}
