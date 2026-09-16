import 'server-only';
import type {
  CustomField,
  PublicInviteOwner,
  PublicSurvey,
  SurveyAnswer,
  SurveyConfig,
  SurveyConfigInput,
  SurveyResponse,
} from '@/lib/types';
import { DEFAULT_SURVEY_SUCCESS, DEFAULT_SURVEY_TITLE } from '@/lib/types';
import { createInviteToken, hashToken } from '@/lib/auth/tokens';
import { inviteBannerSrc } from '@/lib/domain/invite-banner';
import { linkCode } from '@/lib/domain/link-code';
import { normalizePhone } from '@/lib/utils/phone';
import {
  TABLES,
  type ClientRow,
  type MemberRow,
  type SurveyFieldRow,
  type SurveyInviteRow,
  type SurveyResponseRow,
  type SurveyResponseValueRow,
  type UserRow,
} from '@/lib/supabase/tables';
import {
  callFunction,
  deleteRows,
  inFilter,
  insertRows,
  selectOne,
  selectRows,
  updateRows,
} from '@/lib/supabase/rest';
import { isDataUrl, signedUrl, signedUrls, uploadImage } from '@/lib/supabase/storage';
import { badRequest, notFound } from './http';

/**
 * Questionario do time (migration 023).
 *
 * O sistema tem DOIS formularios publicos, e eles nao se misturam:
 *
 *   - o de CADASTRO transforma quem responde em integrante da equipe;
 *   - o QUESTIONARIO e uma pesquisa que a equipe envia para outras pessoas.
 *     Quem responde nao vira integrante, nao ganha acesso e nao entra em
 *     contagem nenhuma. A resposta fica guardada a parte.
 *
 * Nada neste arquivo escreve em `cmd_members`, `cmd_users`,
 * `cmd_member_responses` ou `cmd_invites`: o recrutamento nao e tocado.
 *
 * As perguntas sao do TIME (uma colecao por time) e so o ADMIN geral as
 * monta. O link e de uso unico, com o MESMO prazo configurado em
 * Configuracoes — o banco o le pela mesma funcao do link de cadastro, entao
 * nao existem duas regras de duracao.
 */

const FIELD_COLUMNS =
  'id,client_id,system_key,type,label,placeholder,help_text,required,enabled,position,options,' +
  'created_at,updated_at';

const INVITE_COLUMNS =
  'id,client_id,user_id,owner_name,owner_role,generated_by_user_id,generated_by_name,' +
  'generated_by_role,token,token_hash,active,status,generation,issued_at,expires_at,' +
  'claim_hash,claimed_at,consumed_at,response_id,created_at';

const SURVEY_CLIENT_COLUMNS =
  'id,name,photo_path,is_demo,banner_path,survey_active,survey_title,survey_intro_text,' +
  'survey_success_message,survey_updated_at,banner_tag_left,banner_tag_width,banner_tag_top,' +
  'banner_tag_size,banner_tag_color';

type SurveyClientRow = Pick<
  ClientRow,
  | 'id'
  | 'is_demo'
  | 'banner_path'
  | 'name'
  | 'photo_path'
  | 'survey_active'
  | 'survey_title'
  | 'survey_intro_text'
  | 'survey_success_message'
  | 'survey_updated_at'
  | 'banner_tag_left'
  | 'banner_tag_width'
  | 'banner_tag_top'
  | 'banner_tag_size'
  | 'banner_tag_color'
>;

/* -------------------------------------------------------------------------
   Leitura da configuracao
   ------------------------------------------------------------------------- */

function toSurveyField(row: SurveyFieldRow): CustomField {
  return {
    id: row.id,
    // Campo padrao correspondente (migration 026). Ele decide apenas o
    // desenho e a validacao — mascara, lista de genero e de UF, envio da
    // foto. Nenhuma consulta externa e acionada no Formulario 2: a
    // verificacao de CPF e de titulo pertence ao cadastro.
    systemKey: row.system_key ?? null,
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

async function loadSurveyFields(clientId: string): Promise<CustomField[]> {
  const rows = await selectRows<SurveyFieldRow>(TABLES.surveyFields, {
    select: FIELD_COLUMNS,
    filters: { client_id: `eq.${clientId}` },
    order: 'position.asc',
  });
  return rows.map(toSurveyField);
}

function toSurveyConfig(row: SurveyClientRow, fields: CustomField[]): SurveyConfig {
  return {
    active: row.survey_active,
    title: row.survey_title || DEFAULT_SURVEY_TITLE,
    introText: row.survey_intro_text,
    successMessage: row.survey_success_message || DEFAULT_SURVEY_SUCCESS,
    fields,
    updatedAt: row.survey_updated_at,
  };
}

async function requireSurveyClient(clientId: string): Promise<SurveyClientRow> {
  const row = await selectOne<SurveyClientRow>(TABLES.clients, {
    select: SURVEY_CLIENT_COLUMNS,
    filters: { id: `eq.${clientId}` },
  });
  if (!row) throw notFound('Time não encontrado.');
  return row;
}

/** Questionario do time, com as perguntas na ordem de exibicao. */
export async function getSurvey(clientId: string): Promise<SurveyConfig> {
  const [row, fields] = await Promise.all([
    requireSurveyClient(clientId),
    loadSurveyFields(clientId),
  ]);
  return toSurveyConfig(row, fields);
}

/* -------------------------------------------------------------------------
   Montagem das perguntas (somente ADMIN geral)
   ------------------------------------------------------------------------- */

/**
 * Grava a configuracao e as perguntas.
 *
 * As perguntas chegam inteiras, na ordem final: o que sumiu da lista e
 * apagado, o que ficou e atualizado, o que chegou e criado. O ID de cada
 * pergunta e estavel, entao reordenar ou renomear nao inventa pergunta nova
 * — e as respostas ja gravadas guardam a propria copia do rotulo, de todo
 * jeito.
 *
 * O tipo `photo` nao entra: o questionario nao recebe arquivo, e o banco
 * recusa de qualquer forma.
 */
export async function updateSurvey(
  clientId: string,
  input: SurveyConfigInput,
): Promise<SurveyConfig> {
  await requireSurveyClient(clientId);

  const patch: Record<string, string | boolean> = { survey_updated_at: new Date().toISOString() };
  if (input.active !== undefined) patch.survey_active = input.active;
  if (input.title !== undefined) {
    const titulo = input.title.trim();
    if (!titulo) throw badRequest('O Formulário 2 precisa de um título.');
    patch.survey_title = titulo;
  }
  if (input.introText !== undefined) patch.survey_intro_text = input.introText;
  if (input.successMessage !== undefined) patch.survey_success_message = input.successMessage;

  await updateRows<ClientRow>(TABLES.clients, { id: `eq.${clientId}` }, patch, 'id');

  if (input.fields) {
    await persistFields(clientId, input.fields);
  }

  return getSurvey(clientId);
}

async function persistFields(clientId: string, fields: CustomField[]): Promise<void> {
  const atuais = await selectRows<Pick<SurveyFieldRow, 'id'>>(TABLES.surveyFields, {
    select: 'id',
    filters: { client_id: `eq.${clientId}` },
  });

  const enviados = new Set(fields.map((field) => field.id));
  const removidos = atuais.filter((row) => !enviados.has(row.id)).map((row) => row.id);

  // A ordem importa: apagar primeiro evita colidir com a posicao de quem
  // ficou. Excluir uma pergunta nao apaga resposta nenhuma — a resposta
  // guarda o proprio rotulo e apenas perde a referencia.
  if (removidos.length > 0) {
    await deleteRows(TABLES.surveyFields, { id: inFilter(removidos) });
  }

  const existentes = new Set(atuais.map((row) => row.id));
  const novos = fields.filter((field) => !existentes.has(field.id));
  const antigos = fields.filter((field) => existentes.has(field.id));

  for (const [index, field] of fields.entries()) {
    field.order = index;
  }

  if (novos.length > 0) {
    await insertRows(
      TABLES.surveyFields,
      // SEM `id`: quem gera e o banco.
      //
      // O identificador que chega da tela e provisorio — o construtor o cria
      // no navegador para mexer na lista antes de salvar —, e a coluna e
      // `uuid`. Mandar aquele texto fazia o banco recusar a linha inteira, e
      // a tela so dizia "não foi possível concluir a operação": nenhum campo
      // novo do Formulario 2 conseguia ser gravado.
      //
      // E o mesmo que o formulario de cadastro sempre fez em `syncFields`.
      novos.map((field) => ({
        client_id: clientId,
        system_key: field.systemKey,
        type: field.type,
        label: field.label,
        placeholder: field.placeholder,
        help_text: field.helpText,
        required: field.required,
        enabled: field.enabled,
        position: field.order,
        options: field.options,
      })),
    );
  }

  for (const field of antigos) {
    await updateRows(
      TABLES.surveyFields,
      { id: `eq.${field.id}`, client_id: `eq.${clientId}` },
      {
        system_key: field.systemKey,
        type: field.type,
        label: field.label,
        placeholder: field.placeholder,
        help_text: field.helpText,
        required: field.required,
        enabled: field.enabled,
        position: field.order,
        options: field.options,
      },
      'id',
    );
  }
}

/* -------------------------------------------------------------------------
   Link de uso unico
   ------------------------------------------------------------------------- */

export interface IssuedSurveyLink {
  inviteId: string;
  token: string;
  issuedAt: string;
  expiresAt: string;
}

interface IssueRow {
  invite_id: string;
  issued_at: string;
  expires_at: string;
}

/**
 * Gera ou renova o link do questionario de um usuario.
 *
 * `userId` e o DONO — quem envia o link e cujo nome fica na resposta.
 * `generatedByUserId` e quem clicou: o proprio dono, ou o ADMIN geral agindo
 * em nome dele.
 *
 * O banco recusa a geracao com o questionario desligado ou sem nenhuma
 * pergunta ativa: nao existe link para um questionario que nao pergunta
 * nada.
 */
export async function issueSurveyLink(
  userId: string,
  generatedByUserId?: string | null,
): Promise<IssuedSurveyLink> {
  const token = createInviteToken();

  const rows = await callFunction<IssueRow[]>('cmd_survey_invite_issue', {
    p_user_id: userId,
    p_token: token,
    p_token_hash: hashToken(token),
    p_generated_by: generatedByUserId ?? null,
  });

  const row = Array.isArray(rows) ? rows[0] : (rows as unknown as IssueRow);
  return {
    inviteId: row.invite_id,
    token,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
  };
}

/**
 * Gera o link do questionario do TIME.
 *
 * Igual ao link de cadastro do time: o dono e o administrador ATIVO mais
 * antigo daquele time, e nunca um acesso desativado — emitir por ele falharia
 * no banco com "usuario inativo".
 */
export async function issueTeamSurveyLink(
  clientId: string,
  generatedByUserId?: string | null,
): Promise<IssuedSurveyLink> {
  const user = await selectOne<Pick<UserRow, 'id'>>(TABLES.users, {
    select: 'id',
    filters: { client_id: `eq.${clientId}`, role: 'eq.CANDIDATE', is_active: 'is.true' },
    order: 'created_at.asc',
  });
  if (!user) throw notFound('Cadastre um administrador do time antes de criar o link.');

  return issueSurveyLink(user.id, generatedByUserId);
}

/** Marca como expirado o que passou do prazo. Sem cron: acontece na leitura. */
export async function expireDueSurveyLinks(): Promise<void> {
  await callFunction<number>('cmd_survey_expire_due', {}).catch(() => undefined);
}

/* -------------------------------------------------------------------------
   Abertura do link publico
   ------------------------------------------------------------------------- */

export type SurveyLinkState =
  | { kind: 'ready'; survey: PublicSurvey; expiresAt: string }
  | { kind: 'gone' }
  | { kind: 'unavailable' };

async function findSurveyInvite(token: string): Promise<SurveyInviteRow | null> {
  if (!token) return null;
  return selectOne<SurveyInviteRow>(TABLES.surveyInvites, {
    select: INVITE_COLUMNS,
    filters: { token_hash: `eq.${hashToken(token)}` },
  });
}

/**
 * Resolve o token do link e devolve o que a tela publica precisa.
 *
 * Prazo e estado sao conferidos com o horario do SERVIDOR, nunca com o do
 * navegador. Link vencido, consumido, revogado ou reservado por outro
 * aparelho responde sempre a mesma coisa: encerrado, sem dizer por que.
 */
export async function resolveSurveyLink(token: string): Promise<SurveyLinkState> {
  const invite = await findSurveyInvite(token);
  if (!invite) return { kind: 'unavailable' };

  if (invite.status === 'CONSUMED' || invite.status === 'EXPIRED' || invite.status === 'REVOKED') {
    return { kind: 'gone' };
  }
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    await expireDueSurveyLinks();
    return { kind: 'gone' };
  }
  if (!invite.active) return { kind: 'unavailable' };

  // `select: '*'` de proposito: a lista de colunas quebraria inteira em um
  // banco que ainda nao recebeu a migration mais nova, e esta e uma pagina
  // PUBLICA — ela nao pode depender de o banco estar em dia.
  const row = await selectOne<SurveyClientRow>(TABLES.clients, {
    select: '*',
    filters: { id: `eq.${invite.client_id}` },
  });
  if (!row || !row.survey_active) return { kind: 'unavailable' };

  const [fields, photo, banner] = await Promise.all([
    loadSurveyFields(row.id),
    signedUrl(row.photo_path),
    signedUrl(row.banner_path ?? null),
  ]);

  const visiveis = fields.filter((field) => field.enabled);
  if (visiveis.length === 0) return { kind: 'unavailable' };

  return {
    kind: 'ready',
    expiresAt: invite.expires_at,
    survey: {
      clientId: row.id,
      clientName: row.name,
      // O questionario abre pela mesma moldura do cadastro, no mesmo
      // celular: o banner e escolhido pela mesma regra.
      bannerSrc: inviteBannerSrc({ banner, isDemo: row.is_demo === true }),
      bannerTag: {
        left: Number(row.banner_tag_left),
        width: Number(row.banner_tag_width),
        top: Number(row.banner_tag_top),
        size: Number(row.banner_tag_size),
        color: row.banner_tag_color,
      },
      owner: await surveyOwner(invite, photo),
      linkCode: linkCode(token),
      title: row.survey_title || DEFAULT_SURVEY_TITLE,
      introText: row.survey_intro_text,
      successMessage: row.survey_success_message || DEFAULT_SURVEY_SUCCESS,
      fields: visiveis,
    },
  };
}

/**
 * Quem enviou o link, na mesma forma do convite de cadastro.
 *
 * O nome e o perfil sao o SNAPSHOT gravado na geracao: continuam corretos
 * mesmo que o usuario tenha sido excluido depois. A foto e a do integrante,
 * no perfil EQUIPE, e a do proprio time no perfil do Administrador do time —
 * exatamente o mesmo criterio da tela de cadastro.
 */
async function surveyOwner(
  invite: SurveyInviteRow,
  clientPhotoUrl: string | null,
): Promise<PublicInviteOwner | null> {
  const role = invite.owner_role;
  if (!invite.owner_name || (role !== 'CANDIDATE' && role !== 'EQUIPE')) return null;

  if (role === 'CANDIDATE') {
    return { name: invite.owner_name, photoUrl: clientPhotoUrl, role: 'CANDIDATE' };
  }

  let photoUrl: string | null = null;
  if (invite.user_id) {
    const user = await selectOne<Pick<UserRow, 'member_id'>>(TABLES.users, {
      select: 'member_id',
      filters: { id: `eq.${invite.user_id}` },
    });

    if (user?.member_id) {
      const member = await selectOne<Pick<MemberRow, 'photo_path'>>(TABLES.members, {
        select: 'photo_path',
        filters: { id: `eq.${user.member_id}` },
      });
      photoUrl = await signedUrl(member?.photo_path ?? null);
    }
  }

  return { name: invite.owner_name, photoUrl, role: 'EQUIPE' };
}

/** Reserva o link para o primeiro navegador que o abriu. */
export type SurveyClaimOutcome = 'OK' | 'TAKEN' | 'GONE' | 'BUSY';

export async function claimSurveyLink(
  token: string,
  claimHash: string,
): Promise<SurveyClaimOutcome> {
  return callFunction<SurveyClaimOutcome>('cmd_survey_invite_claim', {
    p_token_hash: hashToken(token),
    p_claim_hash: claimHash,
  });
}

/* -------------------------------------------------------------------------
   Envio da resposta
   ------------------------------------------------------------------------- */

export interface SurveySubmission {
  name: string;
  phone: string;
  answers: { fieldId: string; value: SurveyAnswer['value'] }[];
}

export type SurveyAnswerOutcome = 'OK' | 'TAKEN' | 'GONE';

interface AnswerRow {
  outcome: SurveyAnswerOutcome;
  response_id: string | null;
}

/**
 * Grava a resposta e fecha o link, em uma transacao so no banco.
 *
 * O rotulo e o tipo de cada pergunta sao copiados aqui, no servidor, a
 * partir das perguntas DAQUELE time: o navegador envia apenas o identificador
 * da pergunta e o valor. Pergunta de outro time simplesmente nao existe
 * nesta consulta e e descartada.
 *
 * Quem responde NAO vira integrante: nenhuma linha e escrita em
 * `cmd_members` ou `cmd_users`.
 */
export async function submitSurveyAnswer(
  token: string,
  claimHash: string,
  input: SurveySubmission,
): Promise<SurveyAnswerOutcome> {
  const invite = await findSurveyInvite(token);
  if (!invite) return 'GONE';

  const perguntas = await selectRows<SurveyFieldRow>(TABLES.surveyFields, {
    select: FIELD_COLUMNS,
    filters: { client_id: `eq.${invite.client_id}`, enabled: 'is.true' },
    order: 'position.asc',
  });

  const porId = new Map(perguntas.map((field) => [field.id, field]));
  const respostas: {
    field_id: string;
    label: string;
    type: string;
    value: SurveyAnswer['value'];
  }[] = [];

  for (const answer of input.answers) {
    const field = porId.get(answer.fieldId);
    if (!field) continue;

    respostas.push({
      field_id: field.id,
      // Copia do momento do envio: renomear o campo depois nao muda o
      // sentido do que ja foi respondido.
      label: field.label,
      type: field.type,
      value: await gravavel(field, answer.value),
    });
  }

  const rows = await callFunction<AnswerRow[]>('cmd_survey_answer', {
    p_token_hash: hashToken(token),
    p_claim_hash: claimHash,
    p_name: input.name.trim(),
    p_phone: normalizePhone(input.phone),
    p_values: respostas,
  });

  const row = Array.isArray(rows) ? rows[0] : (rows as unknown as AnswerRow);
  return row?.outcome ?? 'GONE';
}

/**
 * Valor pronto para gravar.
 *
 * A foto chega como imagem embutida no proprio texto (data URL) e pode ter
 * megabytes: guardar isso em `jsonb` incharia a tabela e faria cada leitura
 * da lista arrastar todas as imagens junto. Ela vai para o bucket privado,
 * como a foto do integrante, e o que fica gravado e o caminho — assinado na
 * leitura, com prazo.
 */
async function gravavel(
  field: SurveyFieldRow,
  value: SurveyAnswer['value'],
): Promise<SurveyAnswer['value']> {
  if (field.type === 'photo') {
    if (typeof value !== 'string' || !isDataUrl(value)) return null;
    const enviada = await uploadImage('survey', value);
    return enviada.path;
  }

  return legivel(field, value);
}

/**
 * Valor gravado de uma resposta.
 *
 * Escolha e lista de escolhas viajam como IDENTIFICADOR da opcao, que nao
 * quer dizer nada para quem le. Aqui o identificador vira o rotulo escolhido,
 * no momento do envio — junto com o rotulo da propria pergunta, e pela mesma
 * razao: renomear ou excluir a opcao depois nao pode mudar o sentido do que
 * ja foi respondido.
 *
 * Identificador sem opcao correspondente e descartado: melhor uma resposta a
 * menos do que um codigo interno exibido como se fosse texto.
 */
function legivel(field: SurveyFieldRow, value: SurveyAnswer['value']): SurveyAnswer['value'] {
  if (field.type !== 'select' && field.type !== 'multiselect') return value ?? null;

  const rotulos = new Map(
    (Array.isArray(field.options) ? field.options : []).map((option) => [option.id, option.label]),
  );

  if (Array.isArray(value)) {
    return value.map((item) => rotulos.get(item)).filter((item): item is string => Boolean(item));
  }
  if (typeof value === 'string') return rotulos.get(value) ?? null;
  return value ?? null;
}

/* -------------------------------------------------------------------------
   Leitura das respostas
   ------------------------------------------------------------------------- */

/** Recorte da hierarquia: EQUIPE le somente as respostas que ela mesma pediu. */
export interface SurveyResponseFilter {
  clientId: string;
  /** Quando preenchido, so as respostas vindas do link daquele usuario. */
  senderUserId?: string | null;
}

/**
 * Respostas recebidas, da mais recente para a mais antiga.
 *
 * O recorte por remetente e aplicado no SERVIDOR: o identificador que vem da
 * tela nao decide nada — quem chama passa o escopo ja resolvido da sessao.
 */
export async function listSurveyResponses(
  filter: SurveyResponseFilter,
): Promise<SurveyResponse[]> {
  const filters: Record<string, string> = { client_id: `eq.${filter.clientId}` };
  if (filter.senderUserId) filters.sender_user_id = `eq.${filter.senderUserId}`;

  const respostas = await selectRows<SurveyResponseRow>(TABLES.surveyResponses, {
    select: 'id,client_id,sender_name,sender_role,name,phone,answered_at',
    filters,
    order: 'answered_at.desc',
    limit: 500,
  });
  if (respostas.length === 0) return [];

  const valores = await selectRows<SurveyResponseValueRow>(TABLES.surveyResponseValues, {
    select: 'id,response_id,field_id,field_label,field_type,position,value',
    filters: { response_id: inFilter(respostas.map((row) => row.id)) },
    order: 'position.asc',
  });

  // A foto ficou guardada como caminho no bucket privado: a tela recebe uma
  // URL assinada, com prazo, e nunca o caminho bruto.
  const fotos = await signedUrls(
    valores.map((row) => (row.field_type === 'photo' && typeof row.value === 'string' ? row.value : null)),
  );

  const agrupados = new Map<string, SurveyAnswer[]>();
  for (const [index, row] of valores.entries()) {
    const lista = agrupados.get(row.response_id) ?? [];
    lista.push({
      fieldId: row.field_id,
      label: row.field_label,
      type: row.field_type,
      value: row.field_type === 'photo' ? fotos[index] : row.value,
    });
    agrupados.set(row.response_id, lista);
  }

  return respostas.map((row) => ({
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    phone: row.phone,
    senderName: row.sender_name,
    senderRole: row.sender_role,
    answeredAt: row.answered_at,
    answers: agrupados.get(row.id) ?? [],
  }));
}
