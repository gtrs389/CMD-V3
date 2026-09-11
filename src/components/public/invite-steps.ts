import type { ClientFormConfig, CustomField, SystemFieldKey } from '@/lib/types';
import { CONSENT_KEY, visibleFields } from '@/lib/validation/dynamic-form';

/**
 * As quatro etapas da pagina publica de cadastro.
 *
 * Os campos continuam vindo da configuracao real feita pelo ADMIN: aqui eles
 * sao apenas distribuidos entre as etapas, sempre na ordem definida no
 * construtor. Campo desativado nao entra em etapa nenhuma, entao nao aparece
 * na tela nem e enviado.
 */

export type InviteStepId = 'dados' | 'localizacao' | 'vinculo' | 'revisao';

export interface InviteStep {
  id: InviteStepId;
  /** Rotulo completo, usado nas etapas verticais do desktop. */
  label: string;
  /** Rotulo curto das pastilhas do celular. */
  shortLabel: string;
  title: string;
  description: string;
  /** Campos desta etapa. Vazio na revisao, que so mostra o resumo. */
  fields: CustomField[];
}

/** Dados pessoais: tudo o que identifica a pessoa. */
const PERSONAL_KEYS: readonly SystemFieldKey[] = [
  'photo',
  'name',
  'phone',
  'gender',
  'cpf',
  'voter_id',
  'zone',
  'section',
];

/** Localizacao: o encadeamento Estado -> Municipio -> Bairro -> Rua. */
const LOCATION_KEYS: readonly SystemFieldKey[] = ['state', 'city', 'district', 'street'];

function isKeyOf(field: CustomField, keys: readonly SystemFieldKey[]): boolean {
  return field.systemKey !== null && keys.includes(field.systemKey);
}

/**
 * Etapa do vinculo e das perguntas do ADMIN.
 *
 * Os campos personalizados ativos vivem aqui, junto do vinculo. O titulo
 * acompanha o que a etapa realmente tem: so vinculo, so as perguntas do
 * cadastro, ou os dois. Assim as perguntas configuradas pelo ADMIN nunca
 * ficam escondidas atras de um titulo que nao fala delas.
 */
function bondStep(fields: CustomField[]): InviteStep {
  const relationship = fields.filter((field) => field.systemKey === 'relationship');
  const custom = fields.filter((field) => field.systemKey === null);

  const temVinculo = relationship.length > 0;
  const temPerguntas = custom.length > 0;

  const label = temVinculo ? (temPerguntas ? 'Vínculo e perguntas' : 'Vínculo') : 'Perguntas';

  return {
    id: 'vinculo',
    label,
    shortLabel: temVinculo ? 'Vínculo' : 'Perguntas',
    title: temVinculo
      ? temPerguntas
        ? 'Seu vínculo e mais algumas perguntas'
        : 'Seu vínculo com a mobilização'
      : 'Mais algumas perguntas',
    description: temVinculo
      ? temPerguntas
        ? 'Conte como você se conecta e responda as perguntas do cadastro.'
        : 'Conte como você se conecta a esta mobilização.'
      : 'Responda as perguntas definidas para este cadastro.',
    fields: [...relationship, ...custom].sort((a, b) => a.order - b.order),
  };
}

export function buildInviteSteps(config: ClientFormConfig): InviteStep[] {
  const fields = visibleFields(config);

  const steps: InviteStep[] = [
    {
      id: 'dados',
      label: 'Dados pessoais',
      shortLabel: 'Dados',
      title: 'Vamos começar por você',
      description: 'Preencha seus dados pessoais para continuar.',
      fields: fields.filter((field) => isKeyOf(field, PERSONAL_KEYS)),
    },
    {
      id: 'localizacao',
      label: 'Localização',
      shortLabel: 'Localização',
      title: 'Onde você mora',
      description: 'Escolha na lista ou digite, se a sua localidade não aparecer.',
      fields: fields.filter((field) => isKeyOf(field, LOCATION_KEYS)),
    },
    bondStep(fields),
  ];

  return [
    // Etapa sem nenhum campo ativo simplesmente nao existe: o ADMIN manda.
    ...steps.filter((step) => step.fields.length > 0),
    {
      id: 'revisao',
      label: 'Revisão e confirmação',
      shortLabel: 'Revisão',
      title: 'Revise e confirme',
      description: 'Confira tudo antes de enviar. Depois do envio, não é possível alterar.',
      fields: [],
    },
  ];
}

/**
 * Chaves validadas ao sair da etapa.
 *
 * Na revisao entra tambem o aceite do aviso de privacidade, que e o unico
 * campo proprio daquela etapa.
 */
export function stepValueKeys(step: InviteStep, config: ClientFormConfig): string[] {
  const keys = step.fields.map((field) => field.id);
  if (step.id === 'revisao' && config.privacy.enabled && config.privacy.requireConsent) {
    keys.push(CONSENT_KEY);
  }
  return keys;
}

/**
 * Campo que ocupa a linha inteira.
 *
 * Foto, nome, texto longo, vinculo, genero e escolhas multiplas pedem largura
 * total; os demais entram em duas colunas no desktop, como no desenho.
 */
export function isWideField(field: CustomField): boolean {
  if (field.type === 'photo' || field.type === 'textarea') return true;
  if (field.type === 'multiselect' || field.type === 'checkbox') return true;
  return field.systemKey === 'name' || field.systemKey === 'gender' || field.systemKey === 'relationship';
}
