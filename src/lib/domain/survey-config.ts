import type { ClientFormConfig, CustomField } from '@/lib/types';
import { visibleFields } from '@/lib/validation/dynamic-form';

/**
 * O questionario visto como um formulario comum.
 *
 * A tela publica, a previa do construtor e a validacao sao EXATAMENTE as do
 * cadastro. Para isso, o questionario e convertido aqui na mesma estrutura
 * que elas ja sabem ler — e essa conversao vive em um lugar so, para os tres
 * nunca divergirem.
 *
 * O que a conversao acrescenta sao os dois campos fixos de identificacao da
 * resposta: nome e telefone. Eles nao sao perguntas do ADMIN, nao ficam em
 * `cmd_survey_fields` e nao podem ser excluidos — mas precisam ser
 * desenhados e validados como qualquer outro campo, entao entram aqui.
 *
 * O aviso de privacidade fica desligado: ele pertence ao cadastro, que
 * recolhe documento e endereco. O questionario guarda apenas a resposta.
 */

/** Identificadores dos dois campos fixos. Nunca colidem com um id do banco. */
export const SURVEY_NAME_FIELD_ID = '__nome';
export const SURVEY_PHONE_FIELD_ID = '__telefone';

/**
 * Nome e telefone: identificacao da resposta, sempre presentes.
 *
 * `systemKey` aqui serve para a mascara e a validacao que o sistema ja tem
 * (nome e telefone brasileiro) e para o construtor os mostrar travados.
 * Nenhuma verificacao de CPF, titulo ou endereco e acionada: o questionario
 * nao pede nada disso.
 */
export const SURVEY_IDENTITY_FIELDS: readonly CustomField[] = [
  {
    id: SURVEY_NAME_FIELD_ID,
    systemKey: 'name',
    type: 'text',
    label: 'Seu nome',
    placeholder: 'Nome completo',
    helpText: '',
    required: true,
    enabled: true,
    // O questionario tem UM link so: os dois pares andam sempre juntos.
    requiredEquipe: true,
    enabledEquipe: true,
    order: -2,
    options: [],
  },
  {
    id: SURVEY_PHONE_FIELD_ID,
    systemKey: 'phone',
    type: 'phone',
    label: 'Seu telefone',
    placeholder: '(00) 00000-0000',
    helpText: '',
    required: true,
    enabled: true,
    requiredEquipe: true,
    enabledEquipe: true,
    order: -1,
    options: [],
  },
];

/** Converte o questionario na configuracao de formulario que as telas leem. */
export function toSurveyFormConfig(survey: {
  fields: CustomField[];
  introText: string;
  successMessage: string;
  updatedAt?: string;
}): ClientFormConfig {
  return {
    fields: [
      ...SURVEY_IDENTITY_FIELDS.map((field, index) => ({ ...field, order: index - 2 })),
      ...[...survey.fields]
        .sort((a, b) => a.order - b.order)
        .map((field, index) => ({ ...field, systemKey: null, order: index })),
    ],
    privacy: {
      enabled: false,
      title: '',
      text: '',
      requireConsent: false,
      consentLabel: '',
    },
    introText: survey.introText,
    successMessage: survey.successMessage,
    updatedAt: survey.updatedAt ?? new Date(0).toISOString(),
  };
}

/* -------------------------------------------------------------------------
   Secoes da tela publica
   ------------------------------------------------------------------------- */

/**
 * Quantas perguntas cabem em um bloco antes de o proximo comecar.
 *
 * O cadastro agrupa por significado (dados, endereco, vinculo). O
 * questionario nao tem significado fixo para agrupar, entao o corte e pela
 * quantidade: com muitas perguntas, a rolagem no celular ganha o mesmo
 * ritmo de blocos numerados em vez de virar uma folha unica e interminavel.
 */
const QUESTIONS_PER_BLOCK = 6;

export interface SurveySection {
  id: string;
  title: string;
  description: string;
  fields: CustomField[];
}

/**
 * Blocos do questionario publico, na mesma forma das secoes do cadastro.
 *
 * O primeiro bloco e sempre a identificacao. Os demais sao as perguntas do
 * ADMIN, na ordem do construtor, divididas apenas quando sao muitas.
 */
export function buildSurveySections(config: ClientFormConfig): SurveySection[] {
  const todos = visibleFields(config);
  const identificacao = todos.filter((field) => field.systemKey !== null);
  const perguntas = todos.filter((field) => field.systemKey === null);

  const sections: SurveySection[] = [];

  if (identificacao.length > 0) {
    sections.push({
      id: 'identificacao',
      title: 'Quem está respondendo',
      description: 'Só para sabermos de quem é a resposta.',
      fields: identificacao,
    });
  }

  const blocos = Math.ceil(perguntas.length / QUESTIONS_PER_BLOCK) || 0;

  for (let bloco = 0; bloco < blocos; bloco += 1) {
    const fields = perguntas.slice(
      bloco * QUESTIONS_PER_BLOCK,
      (bloco + 1) * QUESTIONS_PER_BLOCK,
    );

    sections.push({
      id: `perguntas-${bloco + 1}`,
      title: blocos > 1 ? `Perguntas (${bloco + 1} de ${blocos})` : 'Perguntas',
      description:
        bloco === 0
          ? 'Responda com o que você pensa. Não há resposta certa.'
          : 'Continuando.',
      fields,
    });
  }

  return sections;
}
