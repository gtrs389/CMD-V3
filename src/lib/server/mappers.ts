import 'server-only';
import type {
  AccessStatus,
  Client,
  ClientFormConfig,
  CustomField,
  FieldResponse,
  Member,
  Recruiter,
} from '@/lib/types';
import type { InviteState } from '@/lib/domain/invite-expiration';
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

/** Somente o que a tela precisa saber do convite. */
export type InviteSummary = Pick<InviteRow, 'active'> &
  Partial<
    Pick<
      InviteRow,
      'token' | 'created_at' | 'rotated_at' | 'issued_at' | 'expires_at' | 'status'
    >
  >;

export interface ToClientOptions {
  fields: FormFieldRow[];
  invite: InviteSummary | null;
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
      // O link exibido e o guardado no proprio convite; `inviteToken` cobre
      // o convite legado, cujo valor so existe no link que o visitante abriu.
      token: options.inviteToken ?? options.invite?.token ?? null,
      // Quem manda no recrutamento e o interruptor da operacao: desligado
      // pelo ADMIN, todos os links daquele time param de aceitar.
      active: row.recruiting_active && (options.invite?.active ?? true),
      createdAt: options.invite?.created_at ?? row.created_at,
      rotatedAt: options.invite?.rotated_at ?? null,
      // Prazo obrigatorio (migration 013). Link sem convite carregado
      // aparece como expirado: nada fica eterno por omissao.
      state: (options.invite?.status as InviteState) ?? 'EXPIRED',
      issuedAt: options.invite?.issued_at ?? row.created_at,
      expiresAt: options.invite?.expires_at ?? row.created_at,
    },
    form: toFormConfig(row, options.fields),
  };
}

export function toResponse(row: MemberResponseRow): FieldResponse {
  return { fieldId: row.field_id, value: row.value };
}

export interface ToMemberOptions {
  responses: MemberResponseRow[];
  photoUrl: string | null;
  /** Snapshot da origem, ja com a foto do responsavel resolvida. */
  recruitedBy: Recruiter | null;
  /** Estado do acesso do proprio integrante ao CMD. */
  access: AccessStatus;
}

export function toMember(row: MemberRow, options: ToMemberOptions): Member {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    photo: options.photoUrl,
    gender: row.gender,
    cpf: row.cpf,
    voterId: row.voter_id,
    state: row.state,
    city: row.city,
    district: row.district,
    street: row.street,
    relationshipOptionId: row.relationship_option_id,
    relationshipLabel: row.relationship_label,
    responses: options.responses.map(toResponse),
    consentAt: row.consent_at,
    source: row.source,
    recruitedBy: options.recruitedBy,
    access: options.access,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Origem do cadastro a partir da linha do integrante.
 *
 * O nome e o perfil vem do snapshot: continuam valendo mesmo depois que o
 * usuario responsavel e excluido, quando `recruited_by_user_id` fica nulo.
 * Sem snapshot nao ha atribuicao nenhuma.
 */
export function toRecruiter(row: MemberRow, photoUrl: string | null): Recruiter | null {
  if (!row.recruited_by_name || !row.recruited_by_role) return null;
  return {
    userId: row.recruited_by_user_id,
    name: row.recruited_by_name,
    role: row.recruited_by_role,
    photo: photoUrl,
  };
}
