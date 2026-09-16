import 'server-only';
import type { FieldType, FieldValue, SystemFieldKey, TeamAccessAudience } from '@/lib/types';
import type { StepStatus, VerificationStatus } from '@/lib/domain/verification';
import type { LocationKind, LocationPrecision, LocationStatus } from '@/lib/domain/map-location';

/**
 * Nomes e formatos das tabelas do CMD.
 *
 * O prefixo `cmd_` evita conflito com qualquer tabela ja existente no projeto
 * Supabase. As definicoes completas estao em `supabase/migrations/001_cmd_initial.sql`.
 */

export const TABLES = {
  users: 'cmd_users',
  sessions: 'cmd_sessions',
  clients: 'cmd_clients',
  formFields: 'cmd_form_fields',
  members: 'cmd_members',
  teamPeople: 'cmd_team_people',
  teamAccessLinks: 'cmd_team_access_links',
  adminDevices: 'cmd_admin_devices',
  memberResponses: 'cmd_member_responses',
  invites: 'cmd_invites',
  memberDevices: 'cmd_member_devices',
  memberConfirmations: 'cmd_member_confirmations',
  memberVerifications: 'cmd_member_verifications',
  memberVerificationViews: 'cmd_member_verification_views',
  mapLocations: 'cmd_map_locations',
  memberLocations: 'cmd_member_locations',
  settings: 'cmd_settings',
  inviteEvents: 'cmd_invite_events',
  inviteAccessDevices: 'cmd_invite_access_devices',
  inviteGenerations: 'cmd_invite_generations',
  inviteClickAttempts: 'cmd_invite_click_attempts',
  surveyFields: 'cmd_survey_fields',
  surveyInvites: 'cmd_survey_invites',
  surveyResponses: 'cmd_survey_responses',
  surveyResponseValues: 'cmd_survey_response_values',
  apiKeys: 'cmd_api_keys',
  apiKeyEvents: 'cmd_api_key_events',
  demoSeeds: 'cmd_demo_seeds',
} as const;

export interface UserRow {
  id: string;
  name: string;
  /** Nulo no Administrador do time: ele entra por link + telefone. */
  email: string | null;
  /** Nulo enquanto o acesso esta pendente: nao existe senha utilizavel. */
  password_hash: string | null;
  role: 'ADMIN' | 'EQUIPE' | 'CANDIDATE';
  /** Operacao do usuario. Nulo apenas no ADMIN. */
  client_id: string | null;
  /** Integrante correspondente. Preenchido somente no perfil EQUIPE. */
  member_id: string | null;
  /** Administrador do time correspondente (migration 016). */
  team_person_id: string | null;
  /** Telefone normalizado do acesso por link do time. Nunca e senha. */
  phone: string | null;
  /** Senha temporaria em uso: obriga a troca no primeiro acesso. */
  must_change_password: boolean;
  is_active: boolean;
  failed_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string;
  created_at: string;
  /** Aparelho que abriu a sessao do Administrador do time (migration 017). */
  admin_device_id: string | null;
}

/**
 * Aparelho autorizado de um usuario administrativo (migration 017).
 *
 * Tabela propria, separada de `cmd_member_devices`: la o registro apenas
 * observa; aqui ele DECIDE o acesso. Somente o hash da credencial e
 * guardado; as demais colunas sao auditoria.
 */
export interface AdminDeviceRow {
  id: string;
  user_id: string;
  /** SHA-256 da credencial do cookie. O valor puro nunca chega ao banco. */
  device_token_hash: string;
  active: boolean;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  platform: string | null;
  user_agent: string | null;
  screen_width: number | null;
  screen_height: number | null;
  timezone: string | null;
  languages: string | null;
  max_touch_points: number | null;
  /** HMAC do IP publico. O endereco puro nunca e gravado. */
  ip_hash: string | null;
  first_seen_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

export interface ClientRow {
  id: string;
  name: string;
  /** Legado: nao e mais solicitado no cadastro (migration 016). */
  email: string | null;
  photo_path: string | null;
  photo_mime: string | null;
  photo_size: number | null;
  notes: string;
  form_intro_text: string;
  form_success_message: string;
  privacy_enabled: boolean;
  privacy_title: string;
  privacy_text: string;
  privacy_require_consent: boolean;
  privacy_consent_label: string;
  /** Interruptor da operacao: em false nenhum link daquele time aceita cadastro. */
  recruiting_active: boolean;
  /** Estado do time, pela sigla (migration 038). Nulo nos times anteriores. */
  state_uf: string | null;
  /** Municipios onde o time atua (migration 038). Array de nomes. */
  cities: string[];
  /**
   * Time de demonstracao (migration 033). Imutavel depois de criado, e fora
   * de toda metrica global: total de times, integrantes, graficos, mapa
   * geral, rankings e a API contam somente `is_demo = false`.
   */
  is_demo: boolean;
  /**
   * Catalogo que gerou os dados deste Time DEMO (migration 034). Nulo em time
   * real. E por ele que a correcao sabe se o time ja esta na versao atual.
   */
  demo_seed_version: string | null;
  /**
   * Acesso do Time DEMO ao sistema (migration 036).
   *
   * Desligado, nenhuma sessao daquele time resolve e nenhum login novo passa.
   * Nao desativa usuario, nao revoga sessao e nao troca senha: religar
   * devolve tudo como estava. Time real e sempre `true`, por `check`.
   */
  demo_access_enabled: boolean;
  /**
   * Confirmacao de CPF e titulo pela FonteData neste time (migration 041).
   *
   * Em false nenhuma consulta e feita para os cadastros dele — nem durante o
   * preenchimento, nem depois do envio, nem pelo botao da ficha — e zona e
   * secao passam a ser obrigatorias e digitadas a mao.
   */
  verification_enabled: boolean;
  /**
   * Banner do celular deste time (migration 035), no Storage privado.
   *
   * Nulo no time que nao subiu o seu: ele continua exibindo o banner padrao
   * do sistema, como sempre foi.
   */
  banner_path: string | null;
  banner_mime: string | null;
  banner_size: number | null;
  /**
   * Estampa "#NOME DO TIME" sobre o banner do celular (migration 022).
   * Tudo em porcentagem da propria imagem, nunca em pixels da tela.
   */
  banner_tag_left: number;
  banner_tag_width: number;
  banner_tag_top: number;
  banner_tag_size: number;
  banner_tag_color: string;
  /** Questionario do time (migration 023). Formulario proprio, separado do cadastro. */
  survey_active: boolean;
  survey_title: string;
  survey_intro_text: string;
  survey_success_message: string;
  survey_updated_at: string;
  form_updated_at: string;
  created_at: string;
  updated_at: string;
}

export interface FormFieldRow {
  id: string;
  client_id: string;
  system_key: SystemFieldKey | null;
  type: FieldType;
  label: string;
  placeholder: string;
  help_text: string;
  required: boolean;
  enabled: boolean;
  position: number;
  options: { id: string; label: string }[];
  created_at: string;
  updated_at: string;
}

/**
 * Pergunta do questionario do time (migration 023).
 *
 * Mesma forma de `FormFieldRow`, sem `system_key`: toda pergunta e livre. O
 * tipo `photo` e recusado pelo banco — o questionario nao recebe arquivo.
 */
export interface SurveyFieldRow {
  id: string;
  client_id: string;
  /** Campo padrao correspondente (migration 026). Nulo em campo livre. */
  system_key: SystemFieldKey | null;
  type: FieldType;
  label: string;
  placeholder: string;
  help_text: string;
  required: boolean;
  enabled: boolean;
  position: number;
  options: { id: string; label: string }[];
  created_at: string;
  updated_at: string;
}

/** Link de uso unico do questionario, um por usuario (migration 023). */
export interface SurveyInviteRow {
  id: string;
  client_id: string;
  user_id: string | null;
  owner_name: string | null;
  owner_role: 'ADMIN' | 'CANDIDATE' | 'EQUIPE' | null;
  generated_by_user_id: string | null;
  generated_by_name: string | null;
  generated_by_role: 'ADMIN' | 'CANDIDATE' | 'EQUIPE' | null;
  token: string | null;
  token_hash: string;
  active: boolean;
  status: 'ACTIVE' | 'CLAIMED' | 'SUBMITTING' | 'CONSUMED' | 'EXPIRED' | 'REVOKED';
  generation: number;
  issued_at: string;
  expires_at: string;
  claim_hash: string | null;
  claimed_at: string | null;
  consumed_at: string | null;
  response_id: string | null;
  created_at: string;
}

/** Resposta de quem respondeu o questionario. Nunca e um integrante. */
export interface SurveyResponseRow {
  id: string;
  client_id: string;
  invite_id: string | null;
  sender_user_id: string | null;
  sender_name: string | null;
  sender_role: 'ADMIN' | 'CANDIDATE' | 'EQUIPE' | null;
  name: string;
  phone: string;
  answered_at: string;
  created_at: string;
}

/** Um valor respondido, com o rotulo e o tipo copiados do envio. */
export interface SurveyResponseValueRow {
  id: string;
  response_id: string;
  field_id: string | null;
  field_label: string;
  field_type: FieldType;
  position: number;
  value: FieldValue;
}

export interface MemberRow {
  id: string;
  client_id: string;
  name: string;
  phone: string;
  /** E-mail de acesso. Minusculo, sem espacos, unico no sistema. */
  email: string | null;
  photo_path: string | null;
  photo_mime: string | null;
  photo_size: number | null;
  /** Campos padrao com coluna propria (migration 003). Todos opcionais. */
  gender: string | null;
  cpf: string | null;
  voter_id: string | null;
  zone: string | null;
  section: string | null;
  state: string | null;
  city: string | null;
  district: string | null;
  street: string | null;
  relationship_option_id: string | null;
  relationship_label: string | null;
  consent_at: string | null;
  /** Evidencia do aceite, montada no servidor. Nunca vem do navegador. */
  consent_privacy_hash: string | null;
  consent_privacy_snapshot: string | null;
  consent_privacy_version: string | null;
  source: 'invite' | 'admin';
  /**
   * Marca do gerador do Time DEMO (migration 034): guarda a versao do
   * catalogo que criou esta linha. Nulo em todo cadastro real e em quem foi
   * cadastrado a mao dentro de um Time DEMO — e so o que tem a marca pode ser
   * refeito pela rotina de correcao.
   */
  demo_seed: string | null;
  /**
   * Responsavel pelo cadastro (migration 012). O identificador vira nulo se
   * o responsavel for excluido; o snapshot permanece, para o historico
   * continuar existindo.
   *
   * Deixou de ser imutavel na migration 027: o ADMIN geral pode passar um
   * cadastro para outro responsavel, e a troca fica registrada nas tres
   * colunas abaixo. O historico dos LINKS nao muda — em cmd_invite_events
   * continua registrado por qual link a pessoa entrou.
   */
  recruited_by_user_id: string | null;
  recruited_by_name: string | null;
  recruited_by_role: 'ADMIN' | 'CANDIDATE' | 'EQUIPE' | null;
  /** Ultima troca de responsavel (migration 027). Nulo enquanto nao houve. */
  recruiter_changed_at: string | null;
  recruiter_changed_by: string | null;
  recruiter_previous_name: string | null;
  created_at: string;
  updated_at: string;
}

/** Link administrativo do time (migration 016). Um por time. */
export interface TeamAccessLinkRow {
  id: string;
  client_id: string;
  /** Publico do endereco (migration 019): TEAM_ADMIN ou EQUIPE. */
  audience: TeamAccessAudience;
  /** Token em claro: o ADMIN geral precisa copiar o endereco. */
  token: string;
  token_hash: string;
  active: boolean;
  failed_attempts: number;
  locked_until: string | null;
  rotated_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Pessoa do time (migration 015): registro interno do ADMIN, sem relacao
 * com cmd_members ou cmd_users.
 */
export interface TeamPersonRow {
  id: string;
  client_id: string;
  name: string;
  phone: string;
  photo_path: string | null;
  photo_mime: string | null;
  photo_size: number | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface MemberResponseRow {
  id: string;
  /**
   * Redundante de proposito: as chaves estrangeiras compostas no banco usam
   * esta coluna para garantir que integrante e campo sao do mesmo cliente.
   */
  client_id: string;
  member_id: string;
  field_id: string;
  value: FieldValue;
}

/** Ciclo de vida do link pessoal (migration 013). */
export type InviteStatusRow =
  | 'ACTIVE'
  | 'CLAIMED'
  | 'SUBMITTING'
  | 'CONSUMED'
  | 'EXPIRED'
  | 'REVOKED';

export interface InviteRow {
  id: string;
  client_id: string;
  /** Dono do link pessoal. Nulo apenas nos convites anteriores a 012. */
  user_id: string | null;
  /**
   * Identificador opaco do link. Guardado em claro de proposito: o link
   * precisa sobreviver a logout, troca de aparelho e reload, e abrir a
   * pagina publica nunca pode gerar, renovar nem invalidar token.
   */
  token: string | null;
  token_hash: string;
  active: boolean;
  created_at: string;
  rotated_at: string | null;
  /** Prazo obrigatorio (migration 013), sempre no horario do banco. */
  issued_at: string;
  expires_at: string;
  status: InviteStatusRow;
  /** SHA-256 do segredo da reserva. O segredo nunca e guardado. */
  claim_hash: string | null;
  claimed_at: string | null;
  consumed_at: string | null;
  revoked_at: string | null;
  /** Contador de geracoes do mesmo link pessoal. */
  generation: number;
  /**
   * Snapshot do dono no momento da geracao (migration 020). `user_id` e o
   * dono do link; estas duas colunas preservam nome e perfil dele mesmo que
   * o usuario seja excluido depois.
   */
  owner_name: string | null;
  owner_role: 'ADMIN' | 'CANDIDATE' | 'EQUIPE' | null;
  /**
   * Quem clicou para gerar ou renovar. Diferente do dono quando o ADMIN
   * geral gera em nome de outra pessoa. Anulavel, com snapshot ao lado.
   */
  generated_by_user_id: string | null;
  generated_by_name: string | null;
  generated_by_role: 'ADMIN' | 'CANDIDATE' | 'EQUIPE' | null;
  /** Integrante criado por este convite. Anulavel: o historico nao depende dele. */
  member_id: string | null;
}

/** Configuracao global: uma unica linha. */
export interface SettingsRow {
  id: boolean;
  candidate_invite_seconds: number;
  team_invite_seconds: number;
  /** Destino de quem chega ao dominio publico sem link (migration 024). */
  public_redirect_url: string;
  /** Endereco publico dos links enviados (migration 028). Vazio: deduzido. */
  public_link_origin: string;
  updated_at: string;
}

export type InviteEventName = 'GENERATED' | 'CLAIMED' | 'CONSUMED' | 'EXPIRED' | 'REVOKED';

/** Historico imutavel dos links. Sem token, segredo, senha, CPF ou IP. */
export interface InviteEventRow {
  id: string;
  /**
   * Convite de origem. Vira nulo se o convite for excluido (migration 020):
   * o historico se desliga em vez de morrer junto.
   */
  invite_id: string | null;
  /** Identificador estavel da geracao. Nunca some: e ele que agrupa o historico. */
  invite_ref: string;
  client_id: string;
  user_id: string | null;
  owner_name: string | null;
  owner_role: 'ADMIN' | 'CANDIDATE' | 'EQUIPE' | null;
  generation: number;
  event: InviteEventName;
  occurred_at: string;
  /** Quem executou a geracao (migration 020). Anulavel, com snapshot ao lado. */
  generated_by_user_id: string | null;
  generated_by_name: string | null;
  generated_by_role: 'ADMIN' | 'CANDIDATE' | 'EQUIPE' | null;
  /** Integrante criado, gravado no evento CONSUMED. Anulavel. */
  member_id: string | null;
}

/**
 * Aparelho do PRIMEIRO acesso ao link de recrutamento (migration 020).
 *
 * Um registro por convite e geracao. Somente sinais que qualquer site ja
 * enxerga: nada de MAC, IMEI, GPS, canvas ou IP em texto puro — o endereco
 * aparece apenas como HMAC e nunca sai do servidor.
 */
export interface InviteAccessDeviceRow {
  id: string;
  invite_ref: string;
  invite_id: string | null;
  client_id: string;
  generation: number;
  first_access_at: string;
  user_agent: string | null;
  accept_language: string | null;
  /** HMAC do IP publico. Nunca chega ao navegador. */
  ip_hash: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  platform: string | null;
  screen_width: number | null;
  screen_height: number | null;
  timezone: string | null;
  languages: string | null;
  max_touch_points: number | null;
  /** Momento da unica complementacao vinda da pagina. */
  signals_at: string | null;
}

/**
 * Registro imutavel de UMA geracao do link de cadastro (migration 021).
 *
 * `cmd_invites` guarda sempre a geracao corrente; renovar sobrescreve o
 * hash. Esta linha preserva o hash de cada geracao, entao abrir o endereco
 * de uma geracao anterior ainda reconhece o link e registra o clique — sem
 * autorizar cadastro, porque a reserva e o envio continuam procurando o
 * hash em `cmd_invites`.
 */
export interface InviteGenerationRow {
  id: string;
  invite_ref: string;
  invite_id: string | null;
  client_id: string;
  generation: number;
  /** SHA-256 do token daquela geracao. O token puro nunca e guardado. */
  token_hash: string;
  issued_at: string;
  expires_at: string;
  owner_user_id: string | null;
  owner_name: string | null;
  owner_role: 'ADMIN' | 'CANDIDATE' | 'EQUIPE' | null;
  generated_by_user_id: string | null;
  generated_by_name: string | null;
  generated_by_role: 'ADMIN' | 'CANDIDATE' | 'EQUIPE' | null;
  created_at: string;
}

/** Desfecho de uma abertura do link (migration 021). */
export type InviteClickOutcomeRow =
  | 'PENDING'
  | 'ALLOWED'
  | 'EXPIRED'
  | 'TAKEN'
  | 'CONSUMED'
  | 'REVOKED'
  | 'UNAVAILABLE'
  | 'PREVIEW';

/**
 * Uma abertura do link de cadastro (migration 021).
 *
 * Existe tambem quando o link ja estava expirado, reservado, consumido ou
 * revogado: a linha so observa e nunca altera o convite. Pre-visualizacao
 * automatica entra com `kind = 'PREVIEW'` e sem numero de clique.
 */
export interface InviteClickAttemptRow {
  id: string;
  invite_ref: string;
  invite_id: string | null;
  client_id: string;
  generation: number;
  kind: 'HUMAN' | 'PREVIEW';
  click_number: number | null;
  occurred_at: string;
  link_status: InviteStatusRow;
  outcome: InviteClickOutcomeRow;
  user_agent: string | null;
  accept_language: string | null;
  /** HMAC do IP publico. Nunca chega ao navegador. */
  ip_hash: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  platform: string | null;
  screen_width: number | null;
  screen_height: number | null;
  viewport_width: number | null;
  viewport_height: number | null;
  timezone: string | null;
  languages: string | null;
  max_touch_points: number | null;
  signals_at: string | null;
}

/**
 * Sinal tecnico do aparelho usado no cadastro publico (migration 002).
 * Nao autoriza acesso: `status` nasce e permanece 'OBSERVED' nesta etapa.
 */
export interface MemberDeviceRow {
  id: string;
  client_id: string;
  member_id: string;
  /** SHA-256 do token do cookie. O token em si nunca e gravado. */
  device_token_hash: string;
  status: 'OBSERVED' | 'TRUSTED' | 'BLOCKED';
  user_agent: string | null;
  ch_ua: string | null;
  ch_ua_mobile: string | null;
  ch_ua_platform: string | null;
  platform: string | null;
  is_mobile: boolean | null;
  language: string | null;
  timezone: string | null;
  screen_width: number | null;
  screen_height: number | null;
  max_touch_points: number | null;
  /** HMAC-SHA256 do IP publico. O endereco puro nunca e gravado. */
  ip_hash: string | null;
  geo_country: string | null;
  geo_region: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

/** Prova da confirmacao final feita pela pessoa antes do envio. */
export interface MemberConfirmationRow {
  id: string;
  client_id: string;
  member_id: string;
  notice_version: string;
  notice_text: string;
  notice_hash: string;
  confirmed_at: string;
}

/**
 * Verificacao cadastral. Os campos `*_payload` chegam cifrados
 * (AES-256-GCM) e nunca sao gravados em claro.
 */
export interface MemberVerificationRow {
  id: string;
  client_id: string;
  member_id: string;
  status: VerificationStatus;
  cpf_status: StepStatus;
  tse_status: StepStatus;
  cpf_requested_at: string | null;
  cpf_completed_at: string | null;
  tse_requested_at: string | null;
  tse_completed_at: string | null;
  cpf_attempts: number;
  tse_attempts: number;
  cpf_error_code: string | null;
  tse_error_code: string | null;
  cpf_payload: string | null;
  tse_payload: string | null;
  locked_at: string | null;
  lock_token: string | null;
  created_at: string;
  updated_at: string;
}

/** Coordenada ja consultada, compartilhada por consulta normalizada. */
export interface MapLocationRow {
  id: string;
  query_hash: string;
  latitude: number;
  longitude: number;
  title: string | null;
  address: string | null;
  place_id: string | null;
  data_id: string | null;
  image_url: string | null;
  provider: string;
  searched_at: string;
  created_at: string;
}

/** Vinculo do integrante com a moradia aproximada e o local de votacao. */
export interface MemberLocationRow {
  id: string;
  client_id: string;
  member_id: string;
  location_kind: LocationKind;
  status: LocationStatus;
  query_hash: string | null;
  location_id: string | null;
  location_precision: LocationPrecision | null;
  attempts: number;
  error_code: string | null;
  requested_at: string | null;
  resolved_at: string | null;
  locked_at: string | null;
  lock_token: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Chave da API de links de cadastro (migration 029).
 *
 * Somente o SHA-256 do segredo e guardado. `prefix` e a parte publica, usada
 * para reconhecer a chave na tela; `created_by` e a identidade com que ela
 * age — deixando de ser um ADMIN ativo, a chave para de autenticar.
 */
export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  token_hash: string;
  /** ADMIN geral que criou a chave: quem AUTORIZA. */
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  last_used_at: string | null;
  request_count: number;
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_by_name: string | null;
  /**
   * Administrador do time em nome de quem a chave age: quem APARECE no
   * historico do link (migration 031). Imutavel depois da criacao; nulo
   * apenas nas chaves da 029, que por isso nao autenticam mais.
   */
  acting_user_id: string | null;
  acting_user_name: string | null;
  acting_client_id: string | null;
  acting_client_name: string | null;
}

/** Operacoes registradas de uma chave (migrations 030 e 031). */
export type ApiKeyAction =
  | 'LINK_GERADO'
  | 'LINK_REVOGADO'
  | 'LINK_LISTADO'
  | 'LINK_CONSULTADO'
  | 'CHAVE_RECUSADA';

/**
 * Acao de uma chave da API (migration 030).
 *
 * Existe porque o historico do LINK e, de proposito, indistinguivel de um
 * clique do proprio dono no painel: o rastro de que a acao veio da API mora
 * aqui, junto da chave.
 */
export interface ApiKeyEventRow {
  id: string;
  api_key_id: string | null;
  key_name: string | null;
  admin_user_id: string | null;
  admin_name: string | null;
  action: ApiKeyAction;
  /** Resultado da operacao (migration 031). */
  result: 'SUCESSO' | 'RECUSADO';
  /** Motivo tecnico da recusa. Nunca sai do servidor para quem chamou. */
  detail: string | null;
  invite_id: string | null;
  client_id: string | null;
  client_name: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  owner_role: string | null;
  occurred_at: string;
}
