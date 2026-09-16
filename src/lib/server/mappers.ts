import 'server-only';
import type {
  AccessStatus,
  Client,
  ClientFormConfig,
  CustomField,
  FieldResponse,
  Member,
  Recruiter,
  TeamPerson,
} from '@/lib/types';
import type { InviteState } from '@/lib/domain/invite-expiration';
import type {
  ClientRow,
  FormFieldRow,
  InviteRow,
  MemberResponseRow,
  MemberRow,
  TeamPersonRow,
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
    // O campo padrao E-mail nao existe mais em lugar nenhum: nem no
    // construtor, nem no formulario publico, nem na revisao, nem na ficha. A
    // linha continua no banco, desativada (migration 018), para que as
    // respostas e os enderecos ja gravados nao sejam perdidos.
    fields: [...fields]
      .filter((field) => field.system_key !== 'email')
      .sort((a, b) => a.position - b.position)
      .map(toField),
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

/** Pessoa do time: mesma logica de foto das demais entidades. */
export function toTeamPerson(row: TeamPersonRow, photoUrl: string | null): TeamPerson {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    photo: photoUrl,
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
  /** Banner do celular deste time, ja assinado. Nulo: usa o padrao. */
  bannerUrl?: string | null;
  /**
   * Token bruto do convite. So e preenchido no momento em que ele e criado ou
   * renovado, ou na rota publica (onde o visitante ja possui o token).
   */
  inviteToken?: string | null;
  /**
   * Pessoas do time, com a foto ja assinada. Ausente onde a tela nao precisa
   * delas (ex.: contexto do link publico): o time nasce sem nenhuma.
   */
  people?: { row: TeamPersonRow; photoUrl: string | null }[];
}

export function toClient(row: ClientRow, options: ToClientOptions): Client {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    photo: options.photoUrl,
    notes: row.notes,
    stateUf: row.state_uf ?? null,
    // A coluna e jsonb e o banco garante que e um array (038). A guarda aqui
    // e para a linha que veio de um banco ainda sem a migration: melhor um
    // time sem municipio do que a tela inteira quebrada.
    cities: Array.isArray(row.cities) ? row.cities : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    people: (options.people ?? [])
      .slice()
      .sort((a, b) => a.row.position - b.row.position)
      .map((item) => toTeamPerson(item.row, item.photoUrl)),
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
    isDemo: row.is_demo === true,
    // Time real nunca tem acesso desligado: a coluna existe para o DEMO, e o
    // `check` da migration 036 garante o resto.
    demoAccessEnabled: row.demo_access_enabled !== false,
    // Linha de um banco ainda sem a migration 041 nao tem a coluna: vale o
    // padrao, que e o comportamento de sempre — confirmacao ligada.
    verificationEnabled: row.verification_enabled !== false,
    banner: options.bannerUrl ?? null,
    bannerTag: {
      left: Number(row.banner_tag_left),
      width: Number(row.banner_tag_width),
      top: Number(row.banner_tag_top),
      size: Number(row.banner_tag_size),
      color: row.banner_tag_color,
    },
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
  /** Usuario do proprio integrante. Nulo enquanto o acesso nao existe. */
  userId: string | null;
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
    zone: row.zone,
    section: row.section,
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
    // Troca de responsavel (migration 027). Sem instante gravado, o cadastro
    // continua com quem o recebeu.
    recruiterChange: row.recruiter_changed_at
      ? {
          changedAt: row.recruiter_changed_at,
          previousName: row.recruiter_previous_name,
        }
      : null,
    access: options.access,
    userId: options.userId,
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
