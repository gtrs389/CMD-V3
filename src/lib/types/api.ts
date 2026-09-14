import type { InviteState } from '@/lib/domain/invite-expiration';
import type { ApiKeyAction } from '@/lib/supabase/tables';
import type { IsoDate } from './common';

/**
 * API de links de cadastro: chaves e formatos de resposta.
 *
 * Tudo aqui e EXCLUSIVO do ADMIN geral. Administrador do time e integrante
 * continuam gerando e copiando os proprios links pelo painel, como sempre —
 * o que nao alcancam e esta API, as chaves e esta documentacao.
 *
 * Cada chave pertence a UM administrador de UM time, e esse vinculo nasce
 * com ela (migration 031). E dele que a API tira a identidade: nenhuma
 * requisicao escolhe dono nem time.
 */

/** Administrador do time em nome de quem uma chave age. */
export interface ApiKeyBinding {
  userId: string;
  userName: string;
  clientId: string;
  clientName: string;
}

/**
 * Chave da API como a tela de Configuracoes a ve.
 *
 * Nunca carrega o segredo nem o hash dele: apenas o prefixo, que serve para
 * reconhecer a chave na lista.
 */
export interface ApiKeySummary {
  id: string;
  /** Apelido escolhido pelo ADMIN geral ("Integração CRM", por exemplo). */
  name: string;
  /** `cmd_` + 8 caracteres. O restante do segredo nao existe mais aqui. */
  prefix: string;
  createdAt: IsoDate;
  /** ADMIN geral que criou a chave. */
  createdByName: string | null;
  /**
   * Vinculo imutavel da chave. Nulo apenas nas chaves criadas antes da
   * migration 031: elas nao autenticam mais e precisam ser revogadas.
   */
  binding: ApiKeyBinding | null;
  lastUsedAt: IsoDate | null;
  requestCount: number;
  revokedAt: IsoDate | null;
  revokedByName: string | null;
  /** Falso depois de revogada: a chave deixa de autenticar na hora. */
  active: boolean;
}

/**
 * Chave recem-criada.
 *
 * `token` e a UNICA vez que o segredo existe fora do navegador de quem o
 * criou: o banco guarda somente o SHA-256. Fechada a tela, nao ha como
 * recupera-lo — so revogar e criar outra.
 */
export interface CreatedApiKey extends ApiKeySummary {
  token: string;
}

/** Acao registrada de uma chave, como a tela de Configuracoes a ve. */
export interface ApiKeyEvent {
  id: string;
  action: ApiKeyAction;
  /** SUCESSO ou RECUSADO. Recusa fica registrada, mas nunca e detalhada para fora. */
  result: 'SUCESSO' | 'RECUSADO';
  /** Motivo da recusa, visivel apenas aqui, para o ADMIN geral. */
  detail: string | null;
  occurredAt: IsoDate;
  keyName: string | null;
  /** ADMIN geral responsavel pela chave. */
  adminName: string | null;
  clientName: string | null;
  /**
   * Administrador do time em nome de quem a chave agiu.
   *
   * E ele que consta como dono e gerador no historico do link, exatamente
   * como se tivesse clicado no painel — por isso este registro existe.
   */
  ownerName: string | null;
  ownerRole: string | null;
  inviteId: string | null;
}

/** Perfil do dono de um link, como a API o publica. */
export type ApiLinkOwnerRole = 'CANDIDATE' | 'EQUIPE';

/**
 * Link de cadastro na resposta da API.
 *
 * As chaves do JSON sao estaveis: fazem parte do contrato da versao `v1` e
 * so mudam em uma versao nova da API.
 *
 * `url` e o endereco pronto para enviar, montado com o DOMINIO PUBLICO — o
 * mesmo que o painel usa ao copiar o link. Nunca sai daqui hash de token,
 * segredo da reserva, dado da pessoa que se cadastrou, CPF ou titulo.
 */
export interface ApiLink {
  id: string;
  /**
   * Endereco pronto para enviar. Nulo apenas nos links anteriores a migration
   * 012, cujo endereco so existia na mensagem enviada: para esses, gere um
   * link novo — o antigo nao tem como ser reconstruido.
   */
  url: string | null;
  estado: InviteState;
  /** Link individual e recrutamento do time, ambos ligados. */
  ativo: boolean;
  time: { id: string; nome: string };
  dono: { id: string | null; nome: string; perfil: ApiLinkOwnerRole | null };
  geradoPor: { nome: string | null; perfil: string | null };
  geradoEm: IsoDate;
  expiraEm: IsoDate;
  /** Geracao do link. Cada renovacao derruba a anterior e soma 1. */
  geracao: number;
  primeiroAcessoEm: IsoDate | null;
  concluidoEm: IsoDate | null;
  revogadoEm: IsoDate | null;
}

/**
 * Resposta de `GET /api/v1/vinculo`: a quem esta chave pertence.
 *
 * Serve para o sistema externo confirmar, sem adivinhar, em nome de quem os
 * links que ele pedir vao sair.
 */
export interface ApiBindingInfo {
  time: { id: string; nome: string; recrutamentoAtivo: boolean };
  administrador: { id: string; nome: string; perfil: 'CANDIDATE' };
  chave: { nome: string };
}

/**
 * Time disponivel para vincular uma chave, com seus administradores ATIVOS.
 *
 * Usado apenas pela tela de Configuracoes, no momento de criar a chave.
 */
export interface BindableTeam {
  id: string;
  name: string;
  admins: { id: string; name: string }[];
}
