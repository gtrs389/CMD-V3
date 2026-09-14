import type { InviteState } from '@/lib/domain/invite-expiration';
import type { IsoDate } from './common';

/**
 * API de links de cadastro: chaves e formatos de resposta.
 *
 * Tudo aqui e EXCLUSIVO do ADMIN geral. Administrador do time e integrante
 * continuam gerando e copiando os proprios links pelo painel, como sempre —
 * o que nao alcancam e esta API nem a gestao das chaves.
 */

/**
 * Chave da API como a tela de Configuracoes a ve.
 *
 * Nunca carrega o segredo nem o hash dele: apenas o prefixo, que serve para
 * reconhecer a chave na lista.
 */
export interface ApiKeySummary {
  id: string;
  /** Apelido escolhido pelo ADMIN ("Integração WhatsApp", por exemplo). */
  name: string;
  /** `cmd_` + 8 caracteres. O restante do segredo nao existe mais aqui. */
  prefix: string;
  createdAt: IsoDate;
  createdByName: string | null;
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
  /** LINK_GERADO ou LINK_REVOGADO. */
  action: 'LINK_GERADO' | 'LINK_REVOGADO';
  occurredAt: IsoDate;
  /** Como a chamada foi autenticada: a chave, ou a sessao do painel. */
  keyName: string | null;
  /** ADMIN responsavel. */
  adminName: string | null;
  clientName: string | null;
  /**
   * Dono em nome de quem a chave agiu.
   *
   * E ele que consta como gerador no historico do link, exatamente como se
   * tivesse clicado no painel — por isso este registro existe.
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

/** Time na resposta da API, com os administradores que podem ser donos. */
export interface ApiTeam {
  id: string;
  nome: string;
  /** Recrutamento do time ligado. Desligado, nenhum link daquele time aceita cadastro. */
  recrutamentoAtivo: boolean;
  criadoEm: IsoDate;
  administradores: { id: string; nome: string }[];
}
