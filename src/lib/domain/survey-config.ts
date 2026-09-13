import type { ClientFormConfig, CustomField, FieldOption } from '@/lib/types';
import { GENDER_OPTIONS, UF_OPTIONS } from '@/lib/utils/documents';
import { createId } from '@/lib/utils/id';
import { visibleFields } from '@/lib/validation/dynamic-form';
import { buildInviteSections } from '@/components/public/invite-sections';

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
    order: -1,
    options: [],
  },
];

/** Converte o Formulario 2 na configuracao de formulario que as telas leem. */
export function toSurveyFormConfig(survey: {
  fields: CustomField[];
  introText: string;
  successMessage: string;
  updatedAt?: string;
}): ClientFormConfig {
  const proprios = [...survey.fields].sort((a, b) => a.order - b.order);

  // Nome e telefone sao a identificacao da resposta: sem eles nao ha o que
  // gravar em `cmd_survey_responses`. Se o ADMIN ja os configurou — copiando
  // do Formulario 1, por exemplo —, valem OS DELE, com o rotulo e a ordem
  // que ele escolheu. So quando faltam e que os fixos entram na frente.
  const faltando = SURVEY_IDENTITY_FIELDS.filter(
    (fixo) => !proprios.some((field) => field.systemKey === fixo.systemKey),
  );

  return {
    fields: [
      ...faltando.map((field, index) => ({ ...field, order: index - faltando.length })),
      ...proprios.map((field, index) => ({ ...field, order: index })),
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

/**
 * Nome e telefone de quem respondeu, de onde quer que eles venham.
 *
 * Podem ser os campos fixos, quando o ADMIN nao configurou os seus, ou os
 * campos padrao que ele mesmo colocou — copiando do Formulario 1, por
 * exemplo. Quem procura e o `system_key`, e nao o identificador: assim o
 * envio funciona nos dois casos, sem a tela precisar saber qual deles e.
 */
export function identityFrom(
  config: ClientFormConfig,
  values: Record<string, unknown>,
): { name: string; phone: string } {
  const valorDe = (key: 'name' | 'phone') => {
    const campo = config.fields.find((field) => field.systemKey === key);
    const valor = campo ? values[campo.id] : null;
    return typeof valor === 'string' ? valor : '';
  };

  return { name: valorDe('name'), phone: valorDe('phone') };
}

/**
 * O que vai como RESPOSTA, e nao como identificacao.
 *
 * Nome e telefone ficam de fora: eles tem coluna propria na resposta, e
 * grava-los tambem como valor os deixaria repetidos na leitura.
 */
export function answerableFields(config: ClientFormConfig): CustomField[] {
  return visibleFields(config).filter(
    (field) => field.systemKey !== 'name' && field.systemKey !== 'phone',
  );
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
 * Blocos do Formulario 2 publico.
 *
 * Quando ele tem campos padrao — o caso de quem copiou do Formulario 1 —, o
 * agrupamento e EXATAMENTE o do cadastro: dados pessoais, endereco, vinculo
 * e perguntas. E a mesma tela, entao tem de ser a mesma leitura.
 *
 * Sem campos padrao, nao ha significado para agrupar: o corte passa a ser
 * pela quantidade, so para a rolagem no celular ganhar o mesmo ritmo de
 * blocos numerados em vez de virar uma folha unica e interminavel.
 */
export function buildSurveySections(config: ClientFormConfig): SurveySection[] {
  const todos = visibleFields(config);
  const padrao = todos.filter((field) => field.systemKey !== null);
  const livres = todos.filter((field) => field.systemKey === null);

  // Mais do que so nome e telefone: vale o mesmo agrupamento do cadastro.
  if (padrao.length > 2) return buildInviteSections(config);

  const sections: SurveySection[] = [];

  if (padrao.length > 0) {
    sections.push({
      id: 'identificacao',
      title: 'Quem está respondendo',
      description: 'Só para sabermos de quem é a resposta.',
      fields: padrao,
    });
  }

  const blocos = Math.ceil(livres.length / QUESTIONS_PER_BLOCK) || 0;

  for (let bloco = 0; bloco < blocos; bloco += 1) {
    const fields = livres.slice(bloco * QUESTIONS_PER_BLOCK, (bloco + 1) * QUESTIONS_PER_BLOCK);

    sections.push({
      id: `campos-${bloco + 1}`,
      title: blocos > 1 ? `Seus dados (${bloco + 1} de ${blocos})` : 'Seus dados',
      description: bloco === 0 ? 'Preencha os campos abaixo.' : 'Continuando.',
      fields,
    });
  }

  return sections;
}

/* -------------------------------------------------------------------------
   Copiar os campos do Formulario 1
   ------------------------------------------------------------------------- */

/**
 * Os campos do Formulario 1, convertidos para o Formulario 2.
 *
 * Os dois sao formularios SEPARADOS: copiar e um ponto de partida, nao um
 * vinculo. Depois da copia, mexer em um nao toca no outro.
 *
 * A conversao nao e literal, porque o Formulario 2 nao tem a maquinaria do
 * cadastro:
 *
 *   - nome e telefone ficam de fora: o Formulario 2 ja pede os dois como
 *     campos fixos de identificacao da resposta;
 *   - foto fica de fora: o Formulario 2 nao recebe arquivo, e o banco recusa;
 *   - os demais campos padrao viram campos comuns. Perdem a verificacao de
 *     CPF e de titulo, o preenchimento automatico de zona e secao e as
 *     listas encadeadas de endereco — nada disso existe no Formulario 2;
 *   - genero e estado tem lista fixa do sistema, que o cadastro injeta na
 *     hora de desenhar. Como campos comuns eles ficariam sem opcao nenhuma,
 *     entao a lista e materializada aqui.
 */
export interface CopiedForm {
  fields: CustomField[];
  /** Rotulos que nao puderam vir, para a tela dizer quais e por que. */
  leftOut: string[];
}

export function copyFromRegistration(fields: readonly CustomField[]): CopiedForm {
  // TUDO vem: foto, nome, telefone, CPF, endereco, vinculo e as perguntas do
  // ADMIN — na mesma ordem, com o mesmo rotulo, o mesmo obrigatorio/opcional
  // e o mesmo ativo/desativado. Inclusive o que esta desligado la, que chega
  // desligado aqui: e justamente o campo que da mais trabalho remontar.
  //
  // O `system_key` vem junto (migration 026). No Formulario 2 ele decide
  // apenas o desenho e a validacao — mascara, lista de genero e de UF, envio
  // da foto. NENHUMA consulta externa e acionada: a verificacao de CPF e de
  // titulo de eleitor pertence ao cadastro e continua so la.
  const ordenados = [...fields].sort((a, b) => a.order - b.order);

  return {
    fields: ordenados.map((field, index) => ({
      ...field,
      // Identificador novo: os dois formularios sao separados, e a resposta
      // de um nunca pode apontar para o campo do outro.
      id: createId('fld'),
      options: optionsFor(field),
      order: index,
    })),
    leftOut: [],
  };
}

/** Lista de opcoes de um campo que, no cadastro, o sistema preenchia. */
function optionsFor(field: CustomField): FieldOption[] {
  if (field.systemKey === 'gender') {
    return GENDER_OPTIONS.map((option) => ({ id: option.id, label: option.label }));
  }
  if (field.systemKey === 'state') {
    return UF_OPTIONS.map((option) => ({ id: option.id, label: option.label }));
  }
  return field.options;
}
