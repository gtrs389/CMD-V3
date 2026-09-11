import 'server-only';
import type {
  Client,
  ClientFormConfig,
  CustomField,
  FieldResponse,
  Member,
} from '@/lib/types';
import type {
  ClientRow,
  FormFieldRow,
  InviteRow,
  MemberResponseRow,
  MemberRow,
} from '@/lib/supabase/tables';

/**
 * Traducao entre as linhas do Postgres e os tipos que as telas ja usam.
 *
 * As fotos saem daqui como URL assinada (leitura) e nunca como caminho bruto:
 * o navegador nao precisa conhecer a estrutura do bucket.
 */

export function toField(row: FormFieldRow): CustomField {
  return {
    id: row.id,
    systemKey: row.system_key,
    type: row.type,
    label: row.label,
    placeholder: row.placeholder,
    helpText: row.help_text,
    required: row.required,
    enabled: row.enabled,
    order: row.position,
    options: Array.isArray(row.options) ? row.options : [],
  };
}

export function toFormConfig(row: ClientRow, fields: FormFieldRow[]): ClientFormConfig {
  return {
    fields: [...fields].sort((a, b) => a.position - b.position).map(toField),
    introText: row.form_intro_text,
    successMessage: row.form_success_message,
    privacy: {
      enabled: row.privacy_enabled,
      title: row.privacy_title,
      text: row.privacy_text,
      requireConsent: row.privacy_require_consent,
      consentLabel: row.privacy_consent_label,
    },
    updatedAt: row.form_updated_at,
  };
}

export interface ToClientOptions {
  fields: FormFieldRow[];
  invite: InviteRow | null;
  photoUrl: string | null;
  /**
   * Token bruto do convite. So e preenchido no momento em que ele e criado ou
   * renovado, ou na rota publica (onde o visitante ja possui o token).
   */
  inviteToken?: string | null;
}

export function toClient(row: ClientRow, options: ToClientOptions): Client {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    photo: options.photoUrl,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    invite: {
      token: options.inviteToken ?? null,
      active: options.invite?.active ?? false,
      createdAt: options.invite?.created_at ?? row.created_at,
      rotatedAt: options.invite?.rotated_at ?? null,
    },
    form: toFormConfig(row, options.fields),
  };
}

export function toResponse(row: MemberResponseRow): FieldResponse {
  return { fieldId: row.field_id, value: row.value };
}

export function toMember(
  row: MemberRow,
  responses: MemberResponseRow[],
  photoUrl: string | null,
): Member {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    phone: row.phone,
    photo: photoUrl,
    gender: row.gender,
    cpf: row.cpf,
    voterId: row.voter_id,
    state: row.state,
    city: row.city,
    district: row.district,
    relationshipOptionId: row.relationship_option_id,
    relationshipLabel: row.relationship_label,
    responses: responses.map(toResponse),
    consentAt: row.consent_at,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
