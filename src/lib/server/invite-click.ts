import 'server-only';
import type { NextRequest, NextResponse } from 'next/server';
import { browserName, deviceType, EMPTY, osName } from '@/lib/domain/device-summary';
import { hashToken } from '@/lib/auth/tokens';
import { callFunction } from '@/lib/supabase/rest';
import { serverDeviceSignals } from './invite-access';
import type { InviteClickSignalsInput } from '@/lib/validation/server.schema';

/**
 * Cada abertura do link de cadastro (migration 021).
 *
 * Continua sendo o MESMO rastreamento da migration 020, ampliado: a 020
 * guarda o historico por geracao e o aparelho do primeiro acesso; aqui
 * entra a contagem de TODAS as aberturas, inclusive as que nao dao em nada.
 *
 * Regras que este arquivo respeita sem excecao:
 *
 *  - registrar nunca reserva, renova, expira nem consome. Nenhuma funcao
 *    daqui escreve em `cmd_invites`: o uso unico do link e a reserva pelo
 *    primeiro aparelho continuam exatamente como estavam;
 *  - token sem geracao conhecida nao gera registro nenhum, para o banco nao
 *    virar deposito de tentativa aleatoria;
 *  - pre-visualizacao automatica (o robo que o WhatsApp, o Facebook, o
 *    Telegram ou o X dispara para montar a previa, e o prefetch do
 *    navegador) entra marcada como tal e NUNCA recebe numero de clique
 *    humano;
 *  - nada aqui lanca: falhar em registrar jamais pode atrapalhar quem esta
 *    abrindo o link.
 *
 * O que nunca e gravado: token em texto puro, URL do convite, segredo da
 * reserva, IP em texto puro, GPS, MAC, IMEI ou canvas. O IP so aparece como
 * HMAC, e so quando `DEVICE_IP_HMAC_KEY` existe.
 */

/** Situacao do link no instante da abertura. */
export type ClickLinkStatus =
  | 'ACTIVE'
  | 'CLAIMED'
  | 'SUBMITTING'
  | 'CONSUMED'
  | 'EXPIRED'
  | 'REVOKED';

/** Desfecho daquela abertura. */
export type ClickOutcome =
  | 'ALLOWED'
  | 'EXPIRED'
  | 'TAKEN'
  | 'CONSUMED'
  | 'REVOKED'
  | 'UNAVAILABLE'
  | 'PREVIEW';

export interface RecordedClick {
  clickId: string;
  /** Nulo na pre-visualizacao automatica: ela nao ocupa numero humano. */
  clickNumber: number | null;
  linkStatus: ClickLinkStatus;
  /** Desfecho preliminar do banco. O servidor confirma logo depois. */
  outcome: ClickOutcome;
}

interface ClickRow {
  click_id: string;
  click_number: number | null;
  link_status: ClickLinkStatus;
  outcome: ClickOutcome;
}

/* -------------------------------------------------------------------------
   Pre-visualizacao automatica
   ------------------------------------------------------------------------- */

/**
 * Robos de previa conhecidos.
 *
 * A lista e curta e exige a forma completa do agente (com barra, quando ele
 * a usa) de proposito: um falso positivo mandaria uma pessoa de verdade para
 * a tela errada. O navegador embutido do WhatsApp, por exemplo, NAO se
 * identifica como `WhatsApp/`, entao ele nunca cai aqui.
 */
const PREVIEW_AGENTS =
  /facebookexternalhit|Facebot|WhatsApp\/|TelegramBot|Twitterbot|Slackbot|Discordbot|LinkedInBot|SkypeUriPreview|redditbot|Applebot|Googlebot|bingbot|YandexBot|DuckDuckBot|Pinterest(?:bot|\/)|vkShare|embedly|Iframely|Bytespider|curl\/|Wget\/|python-requests|Go-http-client|node-fetch|axios\/|okhttp\/|HeadlessChrome|PhantomJS/i;

/**
 * Como esta abertura chegou.
 *
 *  - `bot`      robo de previa de um aplicativo de mensagem ou rede social.
 *               Nao e uma pessoa e nunca vai preencher nada: a rota para
 *               nele.
 *  - `prefetch` o PROPRIO navegador da pessoa declarou que esta apenas
 *               pre-carregando o endereco. Nao conta como clique humano,
 *               mas o fluxo continua: se o pre-carregamento virar a
 *               navegacao de verdade, o formulario precisa estar la.
 *  - `human`    abertura comum.
 */
export type ClickSource = 'bot' | 'prefetch' | 'human';

export function clickSource(request: NextRequest): ClickSource {
  const agent = request.headers.get('user-agent') ?? '';
  if (PREVIEW_AGENTS.test(agent)) return 'bot';

  const purpose = (
    request.headers.get('sec-purpose') ??
    request.headers.get('purpose') ??
    request.headers.get('x-purpose') ??
    request.headers.get('x-moz') ??
    ''
  ).toLowerCase();

  if (purpose.includes('prefetch') || purpose.includes('preview') || purpose.includes('prerender')) {
    return 'prefetch';
  }

  return 'human';
}

/* -------------------------------------------------------------------------
   Registro da abertura
   ------------------------------------------------------------------------- */

/**
 * Grava a abertura ANTES de qualquer decisao sobre o link.
 *
 * Devolve `null` quando o token nao corresponde a nenhuma geracao conhecida:
 * nesse caso nada e gravado.
 */
export async function recordInviteClick(
  request: NextRequest,
  token: string,
  claimHash: string | null,
  preview: boolean,
): Promise<RecordedClick | null> {
  try {
    const sinais = serverDeviceSignals(request);

    const rows = await callFunction<ClickRow[]>('cmd_invite_click_open', {
      p_token_hash: hashToken(token),
      p_claim_hash: claimHash,
      p_kind: preview ? 'PREVIEW' : 'HUMAN',
      p_user_agent: sinais.userAgent,
      p_accept_language: sinais.acceptLanguage,
      p_ip_hash: sinais.ipHash,
      p_device_type: sinais.deviceType,
      p_browser: sinais.browser,
      p_os: sinais.os,
      p_platform: sinais.platform,
    });

    const row = Array.isArray(rows) ? rows[0] : (rows as unknown as ClickRow | null);
    if (!row?.click_id) return null;

    return {
      clickId: row.click_id,
      clickNumber: row.click_number ?? null,
      linkStatus: row.link_status,
      outcome: row.outcome,
    };
  } catch {
    // Auditoria: falhar aqui nao pode atrapalhar a abertura do link.
    return null;
  }
}

/** Desfecho final daquela abertura, ja confirmado pelo servidor. */
export async function setInviteClickOutcome(
  clickId: string,
  outcome: ClickOutcome,
): Promise<void> {
  await callFunction<boolean>('cmd_invite_click_outcome', {
    p_click_id: clickId,
    p_outcome: outcome,
  }).catch(() => undefined);
}

/**
 * Complementacao unica do aparelho daquele clique.
 *
 * Chega da tela do formulario ou da tela de link indisponivel. Atualiza
 * somente o clique informado e so enquanto os dados ainda nao tiverem
 * chegado. Falhar nunca bloqueia a tela.
 */
export async function completeInviteClickSignals(
  request: NextRequest,
  clickId: string,
  signals: InviteClickSignalsInput | undefined,
): Promise<boolean> {
  try {
    const userAgent = request.headers.get('user-agent')?.trim().slice(0, 512) ?? null;
    const known = (value: string) => (value === EMPTY ? null : value);

    const resultado = await callFunction<boolean>('cmd_invite_click_signals', {
      p_click_id: clickId,
      p_device_type: known(
        deviceType({
          userAgent,
          isMobile: signals?.isMobile ?? null,
          maxTouchPoints: signals?.maxTouchPoints ?? null,
        }),
      ),
      p_browser: known(browserName(userAgent)),
      p_os: osName(userAgent),
      p_platform: signals?.platform ?? null,
      p_screen_width: signals?.screenWidth ?? null,
      p_screen_height: signals?.screenHeight ?? null,
      p_viewport_width: signals?.viewportWidth ?? null,
      p_viewport_height: signals?.viewportHeight ?? null,
      p_timezone: signals?.timezone ?? null,
      p_languages: signals?.languages ?? signals?.language ?? null,
      p_max_touch_points: signals?.maxTouchPoints ?? null,
    });

    return resultado === true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------
   Contexto temporario do clique
   ------------------------------------------------------------------------- */

/**
 * Cookie do clique em andamento.
 *
 * Individual daquela abertura e de vida curta: ele existe apenas para a tela
 * que carregar em seguida dizer a QUAL clique os dados do navegador
 * pertencem. Some assim que a complementacao chega.
 *
 * Guarda somente o identificador do clique — nenhum token, segredo ou dado
 * pessoal. E `HttpOnly`, entao nem a propria pagina consegue le-lo.
 */
export const CLICK_COOKIE = 'cmd_convite_clique';

/** Dez minutos: tempo de sobra para a tela carregar e responder. */
const CLICK_COOKIE_MAX_AGE = 10 * 60;

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function attachClickCookie(response: NextResponse, clickId: string): void {
  response.cookies.set({
    name: CLICK_COOKIE,
    value: clickId,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: CLICK_COOKIE_MAX_AGE,
  });
}

export function readClickCookie(request: NextRequest): string | null {
  const value = request.cookies.get(CLICK_COOKIE)?.value;
  return value && UUID_SHAPE.test(value) ? value : null;
}

/** Consome o contexto: depois da complementacao ele nao serve para mais nada. */
export function clearClickCookie(response: NextResponse): void {
  response.cookies.set({
    name: CLICK_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
