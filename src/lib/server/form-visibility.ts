import 'server-only';
import type { Client, ClientFormConfig, CustomField, SessionUser } from '@/lib/types';
import { can } from '@/lib/permissions';

/**
 * Area interna do formulario: exclusiva do ADMIN.
 *
 * Esconder aba e cartao nao protege nada. A configuracao do formulario sai
 * da resposta antes de chegar ao navegador de quem nao tem `form.view`:
 * textos, aviso de privacidade, obrigatoriedade, campo ativo e a data da
 * ultima alteracao nunca sao enviados, entao as contagens de campos ativos e
 * obrigatorios tambem nao podem ser recalculadas na tela.
 *
 * O formulario publico do link de recrutamento nao passa por aqui: ele e
 * montado em `getInviteContext` e continua recebendo a configuracao
 * completa, porque e ela que desenha o cadastro.
 */

/** Aviso de privacidade neutro: nada do que o ADMIN escreveu. */
function noPrivacy(): ClientFormConfig['privacy'] {
  return { enabled: false, title: '', text: '', requireConsent: false, consentLabel: '' };
}

/**
 * Formulario sem nenhuma configuracao: nem campos, nem opcoes, nem textos.
 *
 * Usado onde nada do formulario e necessario para desenhar a pagina, como
 * em "Minha mobilizacao".
 */
export function hiddenFormConfig(): ClientFormConfig {
  return {
    fields: [],
    privacy: noPrivacy(),
    introText: '',
    successMessage: '',
    updatedAt: '',
  };
}

/**
 * Somente os rotulos necessarios para ler o que a equipe respondeu.
 *
 * O candidato ve a ficha dos proprios integrantes, e o vinculo e as
 * respostas personalizadas so tem nome por causa do campo que as originou.
 * Vao o rotulo, o tipo, a ordem e as opcoes; nenhuma configuracao vai.
 *
 * `required` e `enabled` saem iguais em todos os campos de proposito: assim
 * a resposta nao revela quais campos o ADMIN deixou ativos ou obrigatorios.
 */
function labelOnly(field: CustomField): CustomField {
  return {
    id: field.id,
    systemKey: field.systemKey,
    type: field.type,
    label: field.label,
    order: field.order,
    options: field.options,
    placeholder: '',
    helpText: '',
    required: false,
    enabled: true,
  };
}

function readingLabels(form: ClientFormConfig): ClientFormConfig {
  return {
    fields: form.fields.map(labelOnly),
    privacy: noPrivacy(),
    introText: '',
    successMessage: '',
    updatedAt: '',
  };
}

/**
 * Candidato devolvido ao navegador conforme o perfil da sessao.
 *
 * ADMIN recebe o cadastro inteiro, com a area de formulario completa. Quem
 * nao tem `form.view` recebe apenas os rotulos usados para ler a ficha da
 * propria equipe.
 */
export function clientForSession(
  user: Pick<SessionUser, 'role'> | null | undefined,
  client: Client,
): Client {
  if (can(user, 'form.view')) return client;
  return { ...client, form: readingLabels(client.form) };
}
