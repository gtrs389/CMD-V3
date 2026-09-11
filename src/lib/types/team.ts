import type { StoredImage } from './common';
import type { ClientFormConfig } from './form-field';
import type { PersonalInvite } from './invite';
import type { Member } from './member';

/**
 * Tudo que a pagina "Minha mobilizacao" mostra.
 *
 * Montado no servidor a partir da sessao: o identificador do integrante e o
 * da operacao nunca vem da URL nem do corpo da requisicao. A lista traz
 * somente os recrutados diretos, e o formulario vem apenas para leitura.
 */
export interface TeamOverview {
  /** Identificacao do proprio integrante, para o cabecalho. */
  profile: {
    memberId: string;
    name: string;
    email: string;
    photo: StoredImage | null;
  };
  /** Nome da operacao a que o integrante pertence. */
  candidateName: string;
  /** Cadastrados diretamente pelo link deste integrante. */
  members: Member[];
  /** Formulario configurado pelo candidato. Somente leitura. */
  form: ClientFormConfig;
  /** Link pessoal de recrutamento. */
  invite: PersonalInvite;
}
