import type { ClientFormConfig, CustomField, SystemFieldKey } from '@/lib/types';
import { visibleFields } from '@/lib/validation/dynamic-form';

/**
 * Secoes da pagina publica de cadastro.
 *
 * O formulario e UMA pagina so: as secoes existem apenas para agrupar os
 * campos com um titulo, uma embaixo da outra, sem etapas, sem avancar e sem
 * voltar. Quem preenche enxerga tudo o que sera enviado de uma vez.
 *
 * Os campos continuam vindo da configuracao real feita pelo ADMIN: aqui eles
 * sao apenas distribuidos entre as secoes, sempre na ordem definida no
 * construtor. Campo desativado nao entra em secao nenhuma, entao nao aparece
 * na tela nem e enviado.
 */

export type InviteSectionId = 'dados' | 'endereco' | 'vinculo';

export interface InviteSection {
  id: InviteSectionId;
  label: string;
  title: string;
  description: string;
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

/** Endereco: o encadeamento Estado -> Municipio -> Bairro -> Rua. */
const ADDRESS_KEYS: readonly SystemFieldKey[] = ['state', 'city', 'district', 'street'];

function isKeyOf(field: CustomField, keys: readonly SystemFieldKey[]): boolean {
  return field.systemKey !== null && keys.includes(field.systemKey);
}

/**
 * Secao do vinculo e das perguntas do ADMIN.
 *
 * Os campos personalizados ativos vivem aqui, junto do vinculo. O titulo
 * acompanha o que a secao realmente tem: so vinculo, so as perguntas do
 * cadastro, ou os dois. Assim as perguntas configuradas pelo ADMIN nunca
 * ficam escondidas atras de um titulo que nao fala delas.
 */
function bondSection(fields: CustomField[]): InviteSection {
  const relationship = fields.filter((field) => field.systemKey === 'relationship');
  const custom = fields.filter((field) => field.systemKey === null);

  const temVinculo = relationship.length > 0;
  const temPerguntas = custom.length > 0;

  const label = temVinculo ? (temPerguntas ? 'Vínculo e perguntas' : 'Vínculo') : 'Perguntas';

  return {
    id: 'vinculo',
    label,
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

export function buildInviteSections(config: ClientFormConfig): InviteSection[] {
  const fields = visibleFields(config);

  const sections: InviteSection[] = [
    {
      id: 'dados',
      label: 'Dados pessoais',
      title: 'Seus dados',
      description: 'Preencha seus dados pessoais.',
      fields: fields.filter((field) => isKeyOf(field, PERSONAL_KEYS)),
    },
    {
      id: 'endereco',
      label: 'Endereço',
      title: 'Endereço',
      description: 'Escolha na lista ou digite, se a sua localidade não aparecer.',
      fields: fields.filter((field) => isKeyOf(field, ADDRESS_KEYS)),
    },
    bondSection(fields),
  ];

  // Secao sem nenhum campo ativo simplesmente nao existe: o ADMIN manda.
  return sections.filter((section) => section.fields.length > 0);
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
