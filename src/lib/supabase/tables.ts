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
  memberResponses: 'cmd_member_responses',
  invites: 'cmd_invites',
  memberDevices: 'cmd_member_devices',
  memberConfirmations: 'cmd_member_confirmations',
  memberVerifications: 'cmd_member_verifications',
  memberVerificationViews: 'cmd_member_verification_views',
  mapLocations: 'cmd_map_locations',
  memberLocations: 'cmd_member_locations',
} as const;

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: 'ADMIN' | 'EQUIPE';
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
}

export interface ClientRow {
  id: string;
  name: string;
  email: string;
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
  photo_path: string | null;
  photo_mime: string | null;
  photo_size: number | null;
  /** Campos padrao com coluna propria (migration 003). Todos opcionais. */
  gender: string | null;
  cpf: string | null;
  voter_id: string | null;
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

export interface InviteRow {
  id: string;
  client_id: string;
  token_hash: string;
  active: boolean;
  created_at: string;
  rotated_at: string | null;
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
