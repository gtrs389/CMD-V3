import { appConfig } from '@/config/app.config';
import type {
  ClientFormConfig,
  CustomField,
  FieldOption,
  FieldType,
  Member,
  SystemFieldKey,
} from '@/lib/types';
import { defaultRelationshipOptions } from './relationship';
import { createId } from '@/lib/utils/id';
import { nowIso } from '@/lib/utils/date';

/** Regras de negocio do construtor de formularios. */

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Texto curto',
  textarea: 'Texto longo',
  phone: 'Telefone',
  email: 'E-mail',
  number: 'Número',
  date: 'Data',
  select: 'Lista de seleção',
  multiselect: 'Múltipla escolha',
  checkbox: 'Checkbox',
  photo: 'Foto ou imagem',
};

export const FIELD_TYPE_HINTS: Record<FieldType, string> = {
  text: 'Uma linha. Ideal para nomes, apelidos e identificadores.',
  textarea: 'Várias linhas. Ideal para observações.',
  phone: 'Máscara brasileira e normalização automática.',
  email: 'Validação de endereço de e-mail.',
  number: 'Aceita apenas valores numéricos.',
  date: 'Seletor de data do próprio aparelho.',
  select: 'Uma opção entre várias, em lista suspensa.',
  multiselect: 'Várias opções ao mesmo tempo.',
  checkbox: 'Confirmação única de sim ou não.',
  photo: 'Câmera ou galeria, com prévia antes do envio.',
};

/**
 * Campos nativos: existem em todo formulario e nao podem ser excluidos.
 *
 * Sem E-mail: o integrante nao tem endereco nem senha. Ele entra pelo link
 * do time com o telefone deste cadastro, por isso o telefone e obrigatorio.
 */
const SYSTEM_FIELD_DEFAULTS: Array<{
  systemKey: SystemFieldKey;
  type: FieldType;
  label: string;
  placeholder: string;
  helpText: string;
  required: boolean;
}> = [
  {
    systemKey: 'photo',
    type: 'photo',
    label: 'Foto',
    placeholder: '',
    helpText: 'Use a câmera ou escolha uma imagem da galeria.',
    required: false,
  },
  {
    systemKey: 'name',
    type: 'text',
    label: 'Nome completo',
    placeholder: 'Digite o nome completo',
    helpText: '',
    required: true,
  },
  {
    systemKey: 'phone',
    type: 'phone',
    label: 'Telefone',
    placeholder: '(00) 00000-0000',
    helpText: 'Informe o DDD.',
    required: true,
  },
  {
    systemKey: 'gender',
    type: 'select',
    label: 'Gênero',
    placeholder: '',
    helpText: 'Opcional.',
    required: false,
  },
  {
    systemKey: 'cpf',
    type: 'text',
    label: 'CPF',
    placeholder: '000.000.000-00',
    helpText: 'Somente números serão salvos.',
    required: false,
  },
  {
    systemKey: 'voter_id',
    type: 'text',
    label: 'Título de eleitor',
    placeholder: '0000 0000 0000',
    helpText: 'Doze dígitos, sem o zero à frente.',
    required: false,
  },
  {
    systemKey: 'zone',
    type: 'text',
    label: 'Zona eleitoral',
    placeholder: '000',
    helpText: 'Preenchida automaticamente a partir do título de eleitor.',
    required: false,
  },
  {
    systemKey: 'section',
    type: 'text',
    label: 'Seção eleitoral',
    placeholder: '0000',
    helpText: 'Preenchida automaticamente a partir do título de eleitor.',
    required: false,
  },
  {
    systemKey: 'state',
    type: 'select',
    label: 'Estado (UF)',
    placeholder: '',
    helpText: '',
    required: false,
  },
  {
    systemKey: 'city',
    type: 'text',
    label: 'Município / Cidade',
    placeholder: 'Nome da cidade',
    helpText: '',
    required: false,
  },
  {
    systemKey: 'district',
    type: 'text',
    label: 'Bairro',
    placeholder: 'Nome do bairro',
    helpText: '',
    required: false,
  },
  {
    systemKey: 'street',
    type: 'text',
    label: 'Rua',
    placeholder: 'Nome da rua',
    helpText: '',
    required: false,
  },
  {
    systemKey: 'relationship',
    type: 'select',
    label: 'Vínculo',
    placeholder: '',
    helpText: '',
    required: false,
  },
];

/**
 * Campos padrao cujas opcoes sao definidas pelo sistema, nao pelo ADMIN.
 * O construtor nao edita a lista; ela vem de `@/lib/utils/documents`.
 */
export const FIXED_OPTION_KEYS: readonly SystemFieldKey[] = ['gender', 'state'];

export function hasFixedOptions(field: CustomField): boolean {
  return field.systemKey !== null && FIXED_OPTION_KEYS.includes(field.systemKey);
}

export function createSystemFields(): CustomField[] {
  return SYSTEM_FIELD_DEFAULTS.map((defaults, index) => ({
    id: createId('fld'),
    systemKey: defaults.systemKey,
    type: defaults.type,
    label: defaults.label,
    placeholder: defaults.placeholder,
    helpText: defaults.helpText,
    required: defaults.required,
    enabled: true,
    order: index,
    // O vinculo nasce com as tres opcoes iniciais; os demais nao tem opcao.
    options: defaults.systemKey === 'relationship' ? defaultRelationshipOptions() : [],
  }));
}

export function createDefaultFormConfig(): ClientFormConfig {
  return {
    fields: createSystemFields(),
    introText: '',
    successMessage: 'Cadastro enviado com sucesso.',
    privacy: {
      enabled: appConfig.privacy.enabledByDefault,
      title: appConfig.privacy.defaultTitle,
      text: appConfig.privacy.defaultText,
      requireConsent: false,
      consentLabel: appConfig.privacy.defaultConsentLabel,
    },
    updatedAt: nowIso(),
  };
}

export function createOption(label = ''): FieldOption {
  return { id: createId('opt'), label };
}

export function createField(type: FieldType): CustomField {
  return {
    id: createId('fld'),
    systemKey: null,
    type,
    label: '',
    placeholder: '',
    helpText: '',
    required: false,
    enabled: true,
    order: 0,
    options: type === 'select' || type === 'multiselect' ? [createOption(''), createOption('')] : [],
  };
}

/** Campo nativo obrigatorio nunca pode ser removido nem ter o tipo alterado. */
export function isSystemField(field: CustomField): boolean {
  return field.systemKey !== null;
}

/**
 * Campos que nao podem deixar de ser obrigatorios.
 *
 * Nome identifica a pessoa; telefone e o que da acesso ao CMD, junto do link
 * do time. Sem um dos dois nao existe integrante com acesso.
 */
export function isLockedRequired(field: CustomField): boolean {
  return field.systemKey === 'name' || field.systemKey === 'phone';
}

export function canDeleteField(field: CustomField): boolean {
  return !isSystemField(field);
}

/** Campo padrao tem coluna propria no banco: nao pode ser duplicado. */
export function canDuplicateField(field: CustomField): boolean {
  return !isSystemField(field);
}

/** Telefone nao pode ser desativado: e ele que cria o acesso do integrante. */
export function canDisableField(field: CustomField): boolean {
  return field.systemKey !== 'name' && field.systemKey !== 'phone';
}

/** Reindexa a ordem apos qualquer operacao na lista. */
export function reindex(fields: CustomField[]): CustomField[] {
  return fields.map((field, index) => ({ ...field, order: index }));
}

export function moveField(fields: CustomField[], from: number, to: number): CustomField[] {
  if (from === to || from < 0 || to < 0 || from >= fields.length || to >= fields.length) {
    return reindex(fields);
  }
  const next = [...fields];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return reindex(next);
}

/** Copia um campo gerando novos IDs (campo e opcoes), preservando o original. */
export function duplicateField(field: CustomField): CustomField {
  return {
    ...field,
    id: createId('fld'),
    systemKey: null,
    label: `${field.label} (cópia)`.slice(0, 80),
    options: field.options.map((option) => ({ ...option, id: createId('opt') })),
  };
}

/** Quantidade de integrantes que ja responderam a um campo. */
export function countResponses(members: Member[], fieldId: string): number {
  return members.filter((member) =>
    member.responses.some((response) => {
      if (response.fieldId !== fieldId) return false;
      const { value } = response;
      if (value === null || value === undefined || value === '') return false;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    }),
  ).length;
}


export function canAddField(fields: CustomField[]): boolean {
  return fields.length < appConfig.limits.maxFieldsPerForm;
}
