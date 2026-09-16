import type { IsoDate, StoredImage, Timestamped } from './common';
import type { ClientFormConfig } from './form-field';
import type { Invite } from './invite';

/**
 * Pessoa do time: registro interno do ADMIN, sem relacao com integrantes
 * recrutados pelo link (Member) nem com acesso ao sistema (User). Nunca
 * entra na hierarquia de recrutamento e nunca altera quem cadastrou um
 * integrante.
 */
export interface TeamPerson {
  id: string;
  name: string;
  /** Apenas digitos, sem mascara. */
  phone: string;
  photo: StoredImage | null;
}

/**
 * Pessoa do time enviada pelo formulario de criacao/edicao do time.
 * `id` ausente ou vazio indica uma pessoa nova; presente, uma existente.
 */
export interface TeamPersonInput {
  id?: string;
  name: string;
  phone: string;
  photo: StoredImage | null;
}

/**
 * Link de acesso dos administradores do time.
 *
 * So chega ao navegador do ADMIN geral: administradores do time e
 * integrantes nunca recebem o token. Ele nao e o link de recrutamento: nao
 * expira sozinho, nao e consumido e vale para todos os administradores
 * ativos daquele time, ate o ADMIN geral renovar.
 */
/**
 * Publico de um endereco de acesso do time.
 *
 * Cada publico tem o proprio endereco, e um endereco so aceita os telefones
 * do seu publico: o link dos Administradores nunca deixa um membro entrar, e
 * o da equipe nunca deixa um administrador entrar.
 */
export const TEAM_ACCESS_AUDIENCES = ['TEAM_ADMIN', 'EQUIPE'] as const;
export type TeamAccessAudience = (typeof TEAM_ACCESS_AUDIENCES)[number];

export const TEAM_ACCESS_AUDIENCE_LABELS: Record<TeamAccessAudience, string> = {
  TEAM_ADMIN: 'Administradores do time',
  EQUIPE: 'Equipe',
};

export interface TeamAccessLink {
  audience: TeamAccessAudience;
  token: string;
  active: boolean;
  createdAt: IsoDate;
  rotatedAt: IsoDate | null;
  /**
   * Endereco completo, montado no SERVIDOR com o dominio publico.
   *
   * Montar no navegador punha ali o endereco da aba aberta — o painel, ou
   * pior, o endereco exclusivo do ADMIN, que iria por WhatsApp em cada link
   * copiado. Ausente apenas no repositorio local, sem servidor.
   */
  url?: string | null;
}

/** Os dois enderecos de um time, como o ADMIN geral os ve. */
export type TeamAccessLinks = Record<TeamAccessAudience, TeamAccessLink>;

/**
 * Estampa "#NOME DO TIME" sobre o banner do celular.
 *
 * Posicao e tamanho em PORCENTAGEM da propria imagem: e isso que mantem a
 * estampa no mesmo ponto do banner quando ele encolhe na tela.
 */
export interface BannerTag {
  /** Inicio da faixa, em % da largura. O texto e centralizado nela. */
  left: number;
  /** Largura da faixa, em % da largura da imagem. */
  width: number;
  /** Altura, em % da altura da imagem. */
  top: number;
  /** Corpo da fonte, em % da largura da imagem. */
  size: number;
  /** Cor do texto, em hexadecimal de 6 digitos. */
  color: string;
}

/** Valores de fabrica, iguais aos `default` da migration 022. */
export const DEFAULT_BANNER_TAG: BannerTag = {
  left: 1.5,
  width: 16,
  top: 60,
  size: 1.45,
  color: '#0b5c2c',
};

export interface Client extends Timestamped {
  id: string;
  name: string;
  /** Legado: nao e mais solicitado nem exibido (migration 016). */
  email: string | null;
  photo: StoredImage | null;
  notes: string;
  invite: Invite;
  form: ClientFormConfig;
  /** Administradores do time, na ordem em que foram cadastrados. */
  people: TeamPerson[];
  /**
   * Banner do celular deste time (migration 035), ja como URL assinada.
   *
   * Nulo quando o time nao subiu o seu. Quem decide o que a tela publica
   * mostra nesse caso e `inviteBannerSrc`, e nao o componente.
   */
  banner: StoredImage | null;
  /** Estampa sobre o banner do celular (migration 022). */
  bannerTag: BannerTag;
  /**
   * Time de demonstracao (migration 033).
   *
   * E um time de verdade, nas mesmas tabelas e nas mesmas telas — o que muda
   * e que ele fica FORA de toda metrica global. Imutavel: nao existe editar
   * um time real para vira-lo DEMO, nem o contrario.
   */
  isDemo: boolean;
  /**
   * Estado do time, pela sigla da UF (migration 038).
   *
   * Nulo nos times criados antes dela: o cadastro de time NOVO exige, e um
   * time antigo ganha o estado quando o ADMIN abrir "Editar time". Nulo
   * quer dizer "ainda nao informado", nunca "nao tem".
   */
  stateUf: string | null;
  /**
   * Municipios onde o time atua (migration 038). Opcional e plural: uma
   * operacao raramente cabe em um municipio so. Vazio: o time nao
   * restringiu.
   */
  cities: string[];
  /**
   * Acesso deste Time DEMO ao sistema (migration 036).
   *
   * Sempre `true` em time real. Desligado por um Time DEMO, os
   * administradores dele param de entrar e quem estiver dentro e avisado na
   * hora de que a conta foi desconectada.
   */
  demoAccessEnabled: boolean;
}

export interface ClientInput {
  name: string;
  photo: StoredImage | null;
  notes: string;
  /** Ausente: as pessoas do time nao sao alteradas. */
  people?: TeamPersonInput[];
  /** Ausente: a estampa do banner nao e alterada. */
  bannerTag?: BannerTag;
  /**
   * Banner do celular. Ausente nao mexe no atual; `null` remove e faz o time
   * voltar ao banner padrao do sistema.
   */
  banner?: StoredImage | null;
  /** Sigla da UF. Obrigatoria ao criar; ausente na edicao nao altera. */
  stateUf?: string;
  /** Municipios onde o time atua. Ausente na edicao nao altera. */
  cities?: string[];
}

/** Integrante resumido, usado na pilha de fotos do cartao de cliente. */
export interface ClientMemberPreview {
  id: string;
  name: string;
  photo: StoredImage | null;
}

/** Cliente enriquecido com dados agregados para listagens. */
export interface ClientSummary extends Client {
  memberCount: number;
  lastMemberAt: IsoDate | null;
  /** Integrantes cadastrados no mes corrente. */
  memberCountThisMonth: number;
  /** Integrantes cadastrados nos ultimos sete dias. */
  memberCountLast7Days: number;
  /** Integrantes mais recentes (no maximo quatro), do mais novo ao mais antigo. */
  recentMembers: ClientMemberPreview[];
  /** Quantidade total de pessoas do time. */
  teamPeopleCount: number;
  /** Pessoas do time mais recentes, para a pilha de fotos do cartao. */
  teamPeoplePreview: ClientMemberPreview[];
}
