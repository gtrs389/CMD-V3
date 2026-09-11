import 'server-only';
import type { FieldType, FieldValue, SystemFieldKey } from '@/lib/types';
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
   * Origem imutavel do cadastro (migration 012). O identificador vira nulo
   * se o responsavel for excluido; o snapshot permanece, para o historico
   * continuar existindo.
   */
  recruited_by_user_id: string | null;
  recruited_by_name: string | null;
  recruited_by_role: 'ADMIN' | 'CANDIDATE' | 'EQUIPE' | null;
  created_at: string;
  updated_at: string;
}

/** Link administrativo do time (migration 016). Um por time. */
export interface TeamAccessLinkRow {
  id: string;
  client_id: string;
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
}

/** Configuracao global: uma unica linha. */
export interface SettingsRow {
  id: boolean;
  candidate_invite_seconds: number;
  team_invite_seconds: number;
  updated_at: string;
}

export type InviteEventName = 'GENERATED' | 'CLAIMED' | 'CONSUMED' | 'EXPIRED' | 'REVOKED';

/** Historico imutavel dos links. Sem token, segredo, senha, CPF ou IP. */
export interface InviteEventRow {
  id: string;
  invite_id: string;
  client_id: string;
  user_id: string | null;
  owner_name: string | null;
  owner_role: 'ADMIN' | 'CANDIDATE' | 'EQUIPE' | null;
  generation: number;
  event: InviteEventName;
  occurred_at: string;
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
