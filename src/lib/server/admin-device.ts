import 'server-only';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import type { AdminDeviceInfo } from '@/lib/types';
import { browserName, deviceType, EMPTY, osName } from '@/lib/domain/device-summary';
import { TABLES, type AdminDeviceRow } from '@/lib/supabase/tables';
import { callFunction, inFilter, selectRows } from '@/lib/supabase/rest';
import type { DeviceSignalsInput } from '@/lib/validation/server.schema';

/**
 * Aparelho autorizado do Administrador do time.
 *
 * Cada Administrador entra em UM navegador. O que autoriza e uma credencial
 * secreta sorteada no servidor no primeiro acesso valido e devolvida apenas
 * em cookie HttpOnly; o banco guarda somente o SHA-256 dela.
 *
 * Regras que valem para o arquivo inteiro:
 *  - o valor puro da credencial NUNCA e gravado, devolvido em JSON, escrito
 *    em HTML ou registrado em log;
 *  - os sinais do navegador sao AUDITORIA: nunca substituem a credencial na
 *    hora de decidir o acesso;
 *  - nada de MAC, IMEI, numero de serie, GPS, canvas ou WebGL — o navegador
 *    nao fornece isso e o sistema nao tenta obter;
 *  - o IP so aparece como HMAC, e apenas quando DEVICE_IP_HMAC_KEY existe.
 */

/** Cookie da credencial do aparelho. Separado do cookie de sessao. */
export const ADMIN_DEVICE_COOKIE = 'cmd_admin_device';

/** 400 dias: teto que os navegadores aceitam para cookie persistente. */
export const ADMIN_DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

/** Credencial do cookie: 32 bytes aleatorios em base64url. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43,64}$/;

export interface AdminDeviceCookie {
  token: string;
  /** Verdadeiro quando a credencial acabou de nascer e precisa ir no cookie. */
  isNew: boolean;
}

/** Le a credencial do cookie, ou sorteia uma nova quando ausente ou malformada. */
export function readOrCreateAdminDeviceToken(request: NextRequest): AdminDeviceCookie {
  const current = request.cookies.get(ADMIN_DEVICE_COOKIE)?.value;
  if (current && TOKEN_SHAPE.test(current)) return { token: current, isNew: false };
  return { token: randomBytes(32).toString('base64url'), isNew: true };
}

export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * HMAC do IP publico.
 *
 * Sem `DEVICE_IP_HMAC_KEY` no ambiente devolve null: o registro segue sem o
 * sinal de rede, em vez de guardar algo reversivel.
 */
function hashIp(ip: string | null): string | null {
  const key = process.env.DEVICE_IP_HMAC_KEY?.trim();
  if (!ip || !key || key.length < 16) return null;
  return createHmac('sha256', key).update(ip, 'utf8').digest('hex');
}

/** Primeiro endereco do encadeamento de proxies. Usado apenas para o HMAC. */
function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || null;
}

function text(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** O texto neutro da tela nao vira dado gravado: sem sinal, grava null. */
function known(value: string): string | null {
  return value === EMPTY ? null : value;
}

/**
 * Auditoria do aparelho.
 *
 * Somente os campos previstos: tipo, navegador, sistema, plataforma,
 * User-Agent, resolucao, fuso, idiomas, pontos de toque e o HMAC do IP.
 * Qualquer outro campo que chegue no corpo da requisicao e descartado aqui,
 * porque nada alem destes e lido.
 */
function auditArgs(
  request: NextRequest,
  signals: DeviceSignalsInput | undefined,
): Record<string, string | number | null> {
  const userAgent = text(request.headers.get('user-agent'), 512);
  const platform =
    signals?.platform ?? text(request.headers.get('sec-ch-ua-platform'), 64)?.replace(/"/g, '') ?? null;

  return {
    p_device_type: known(
      deviceType({
        userAgent,
        isMobile: signals?.isMobile ?? null,
        maxTouchPoints: signals?.maxTouchPoints ?? null,
      }),
    ),
    p_browser: known(browserName(userAgent)),
    p_os: osName(userAgent),
    p_platform: platform,
    p_user_agent: userAgent,
    p_screen_width: signals?.screenWidth ?? null,
    p_screen_height: signals?.screenHeight ?? null,
    p_timezone: signals?.timezone ?? null,
    p_languages: signals?.language ?? null,
    p_max_touch_points: signals?.maxTouchPoints ?? null,
    p_ip_hash: hashIp(clientIp(request)),
  };
}

export interface BindAdminDeviceInput {
  request: NextRequest;
  userId: string;
  token: string;
  signals?: DeviceSignalsInput;
}

/**
 * Vincula (ou reconhece) o aparelho do Administrador do time.
 *
 * O trabalho todo acontece em `cmd_admin_device_bind`, que trava a linha do
 * usuario: duas tentativas ao mesmo tempo nunca autorizam dois navegadores.
 *
 * Devolve o identificador do aparelho autorizado, ou `null` quando o acesso
 * precisa ser recusado — sem dizer qual dos casos aconteceu.
 */
export async function bindAdminDevice(input: BindAdminDeviceInput): Promise<string | null> {
  const deviceId = await callFunction<string | null>('cmd_admin_device_bind', {
    p_user_id: input.userId,
    p_token_hash: hashDeviceToken(input.token),
    ...auditArgs(input.request, input.signals),
  }).catch(() => null);

  return typeof deviceId === 'string' && deviceId ? deviceId : null;
}

/**
 * Confere o aparelho de uma sessao ja aberta.
 *
 * Roda em toda requisicao autenticada do Administrador do time: aparelho
 * ativo, credencial igual ao hash guardado e aparelho do MESMO usuario da
 * sessao. Qualquer divergencia devolve `false`, e quem chamou revoga a
 * sessao.
 */
export async function checkAdminDevice(
  userId: string,
  deviceId: string | null,
  token: string | undefined,
): Promise<boolean> {
  if (!deviceId || !token || !TOKEN_SHAPE.test(token)) return false;

  const ok = await callFunction<boolean>('cmd_admin_device_check', {
    p_user_id: userId,
    p_device_id: deviceId,
    p_token_hash: hashDeviceToken(token),
  }).catch(() => false);

  return ok === true;
}

/**
 * Libera um novo aparelho: revoga o atual e derruba as sessoes do usuario.
 *
 * Telefone, nome, foto, time e link nao sao tocados. O proximo acesso
 * correto vincula o novo navegador.
 */
export async function releaseAdminDevice(userId: string): Promise<number> {
  const count = await callFunction<number>('cmd_admin_device_release', { p_user_id: userId });
  return typeof count === 'number' ? count : 0;
}

/**
 * Aparelho ativo de cada usuario, para a lista do ADMIN geral.
 *
 * `device_token_hash` e `ip_hash` ficam de fora de proposito: nenhum valor
 * derivado da credencial ou do IP chega ao navegador.
 */
const SAFE_SELECT = 'user_id,device_type,browser,os,platform,first_seen_at,last_seen_at';

type SafeRow = Pick<
  AdminDeviceRow,
  'user_id' | 'device_type' | 'browser' | 'os' | 'platform' | 'first_seen_at' | 'last_seen_at'
>;

export async function activeAdminDevices(
  userIds: string[],
): Promise<Map<string, AdminDeviceInfo>> {
  const map = new Map<string, AdminDeviceInfo>();
  if (userIds.length === 0) return map;

  const rows = await selectRows<SafeRow>(TABLES.adminDevices, {
    select: SAFE_SELECT,
    filters: { user_id: inFilter(userIds), active: 'is.true' },
  });

  for (const row of rows) {
    map.set(row.user_id, {
      deviceType: row.device_type,
      browser: row.browser,
      os: row.os,
      platform: row.platform,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
    });
  }
  return map;
}
