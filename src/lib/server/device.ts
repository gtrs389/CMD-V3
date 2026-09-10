import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { TABLES, type MemberDeviceRow } from '@/lib/supabase/tables';
import { insertOne, selectOne, updateRows } from '@/lib/supabase/rest';
import type { DeviceSignalsInput } from '@/lib/validation/server.schema';

/**
 * Registro tecnico do aparelho usado no cadastro publico.
 *
 * Sinal de seguranca, nada mais: nesta etapa o registro nao autoriza acesso
 * nenhum e o status nasce sempre OBSERVED.
 *
 * Regras que valem para o arquivo inteiro:
 *  - o token do cookie e o IP puro NUNCA sao gravados nem registrados em log;
 *  - qualquer falha aqui e engolida: o cadastro ja foi salvo e nao pode
 *    depender deste registro;
 *  - nada de MAC, IMEI, serial, GPS, contatos, aplicativos, canvas ou WebGL.
 */

export const DEVICE_COOKIE = 'cmd_device';

/** 400 dias, teto que os navegadores aceitam para cookie persistente. */
export const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

/** Token do cookie: 32 bytes aleatorios em base64url. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,64}$/;

export interface DeviceCookie {
  token: string;
  /** Verdadeiro quando o token acabou de ser criado e precisa ir no cookie. */
  isNew: boolean;
}

/** Le o token do cookie, ou cria um novo quando ausente ou malformado. */
export function readOrCreateDeviceToken(request: NextRequest): DeviceCookie {
  const current = request.cookies.get(DEVICE_COOKIE)?.value;
  if (current && TOKEN_SHAPE.test(current)) return { token: current, isNew: false };
  return { token: randomBytes(32).toString('base64url'), isNew: true };
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * HMAC do IP publico.
 *
 * Sem `DEVICE_IP_HMAC_KEY` no ambiente, devolve null: o registro segue sem o
 * sinal de rede, em vez de gravar algo reversivel ou de barrar o cadastro.
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

function header(request: NextRequest, name: string, max: number): string | null {
  const value = request.headers.get(name)?.trim();
  return value ? value.slice(0, max) : null;
}

interface DeviceColumns {
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
  ip_hash: string | null;
  geo_country: string | null;
  geo_region: string | null;
}

function toColumns(request: NextRequest, signals: DeviceSignalsInput | undefined): DeviceColumns {
  return {
    user_agent: header(request, 'user-agent', 512),
    ch_ua: header(request, 'sec-ch-ua', 256),
    ch_ua_mobile: header(request, 'sec-ch-ua-mobile', 16),
    ch_ua_platform: header(request, 'sec-ch-ua-platform', 64),

    platform: signals?.platform ?? null,
    is_mobile: signals?.isMobile ?? null,
    language: signals?.language ?? null,
    timezone: signals?.timezone ?? null,
    screen_width: signals?.screenWidth ?? null,
    screen_height: signals?.screenHeight ?? null,
    max_touch_points: signals?.maxTouchPoints ?? null,

    ip_hash: hashIp(clientIp(request)),

    // Fornecidos pela Vercel na borda. Ausentes fora dela.
    geo_country: header(request, 'x-vercel-ip-country', 8),
    geo_region: header(request, 'x-vercel-ip-country-region', 16),
  };
}

/** Compara hashes hexadecimais em tempo constante. */
function sameHash(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'hex');
  const bufferB = Buffer.from(b, 'hex');
  if (bufferA.length !== bufferB.length || bufferA.length === 0) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export interface RecordDeviceInput {
  request: NextRequest;
  clientId: string;
  memberId: string;
  token: string;
  signals?: DeviceSignalsInput;
}

/**
 * Grava ou atualiza o aparelho do integrante.
 *
 * Nunca lanca: o cadastro ja esta salvo quando esta funcao roda.
 */
export async function recordMemberDevice(input: RecordDeviceInput): Promise<void> {
  try {
    const tokenHash = sha256(input.token);
    const columns = toColumns(input.request, input.signals);

    const existing = await selectOne<Pick<MemberDeviceRow, 'id' | 'device_token_hash'>>(
      TABLES.memberDevices,
      {
        select: 'id,device_token_hash',
        filters: { member_id: `eq.${input.memberId}`, device_token_hash: `eq.${tokenHash}` },
      },
    );

    if (existing && sameHash(existing.device_token_hash, tokenHash)) {
      await updateRows<MemberDeviceRow>(
        TABLES.memberDevices,
        { id: `eq.${existing.id}` },
        { ...columns, last_seen_at: new Date().toISOString() },
        'id',
      );
      return;
    }

    await insertOne<MemberDeviceRow>(
      TABLES.memberDevices,
      {
        client_id: input.clientId,
        member_id: input.memberId,
        device_token_hash: tokenHash,
        // Explicito de proposito: um aparelho nunca nasce confiavel.
        status: 'OBSERVED',
        ...columns,
      },
      'id',
    );
  } catch {
    // Sinal de seguranca e melhoria: falhar aqui nao pode derrubar o cadastro.
    // Sem log: qualquer mensagem poderia carregar cabecalhos do visitante.
  }
}
