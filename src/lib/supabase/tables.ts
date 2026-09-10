import 'server-only';
import type { FieldType, FieldValue, SystemFieldKey } from '@/lib/types';

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
