import type { IsoDate, StoredImage } from './common';
import type { Client } from './client';
import type { Member } from './member';

/**
 * Tudo que a pagina do integrante mostra.
 *
 * Montado no servidor a partir da sessao: o identificador do integrante e o
 * da operacao nunca vem da URL nem do corpo da requisicao. A lista traz
 * somente os recrutados diretos.
 *
 * `client` tem exatamente o mesmo formato usado na pagina do time, para
 * que os mesmos quadros sejam reaproveitados sem nenhuma variante: a
 * diferenca esta no que o servidor coloca dentro dele. O convite e o link
 * PESSOAL do integrante, e `form` vem vazio: a area interna do formulario e
 * exclusiva do ADMIN.
 */
export interface TeamOverview {
  /** Identificacao do proprio integrante, para o cabecalho. */
  profile: {
    memberId: string;
    name: string;
    email: string;
    photo: StoredImage | null;
    /** Operacao a que ele pertence. */
    candidateName: string;
    /** Data do cadastro dele. */
    joinedAt: IsoDate;
  };
  client: Client;
  /** Cadastrados diretamente pelo link deste integrante. */
  members: Member[];
}
