import 'server-only';
import { createHmac } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { browserName, deviceType, EMPTY, osName } from '@/lib/domain/device-summary';
import { hashToken } from '@/lib/auth/tokens';
import { callFunction } from '@/lib/supabase/rest';
import type { DeviceSignalsInput } from '@/lib/validation/server.schema';

/**
 * Aparelho do PRIMEIRO acesso ao link de recrutamento.
 *
 * Dois momentos, um registro so (migration 020):
 *
 *  1. no redirect da rota `/convite/[token]`, com o que o servidor ja tem em
 *     maos: User-Agent, idioma do cabecalho, instante do banco e o HMAC do
 *     IP quando `DEVICE_IP_HMAC_KEY` existe;
 *  2. depois que `/` carrega, UMA complementacao autenticada pelo cookie da
 *     reserva, com o que so o navegador conhece.
 *
 * Reutiliza os mesmos parsers seguros do restante do sistema
 * (`device-summary`) e o mesmo coletor da pagina (`collectDeviceSignals`).
 *
 * Nunca coleta nem aceita MAC, IMEI, numero de serie, GPS, canvas, WebGL ou
 * IP em texto puro: nao ha coluna, parametro nem leitura para nada disso. O
 * token do convite e o segredo da reserva jamais aparecem em log.
 *
 * Nada aqui lanca: falhar em registrar o aparelho nunca pode impedir o
 * cadastro nem bloquear o formulario.
 */

/** Sem `DEVICE_IP_HMAC_KEY`, o registro segue sem o sinal de rede. */
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

/** O texto neutro da tela nao vira dado gravado: sem sinal, grava null. */
function known(value: string): string | null {
  return value === EMPTY ? null : value;
}

/**
 * Sinais que o SERVIDOR ja tem em maos na propria requisicao.
 *
 * Usado tanto pelo aparelho do primeiro acesso (migration 020) quanto pelo
 * registro de cada clique (migration 021), para os dois lerem exatamente a
 * mesma coisa dos mesmos cabecalhos, com os mesmos parsers.
 */
export interface ServerDeviceSignals {
  userAgent: string | null;
  acceptLanguage: string | null;
  ipHash: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  platform: string | null;
}

export function serverDeviceSignals(request: NextRequest): ServerDeviceSignals {
  const userAgent = header(request, 'user-agent', 512);
  const mobileHint = header(request, 'sec-ch-ua-mobile', 16);

  return {
    userAgent,
    acceptLanguage: header(request, 'accept-language', 128),
    ipHash: hashIp(clientIp(request)),
    deviceType: known(
      deviceType({
        userAgent,
        // `?1` e o unico valor que o cabecalho usa para "e celular".
        isMobile: mobileHint ? mobileHint === '?1' : null,
        maxTouchPoints: null,
      }),
    ),
    browser: known(browserName(userAgent)),
    os: osName(userAgent),
    platform: header(request, 'sec-ch-ua-platform', 64)?.replace(/"/g, '') ?? null,
  };
}

/**
 * Registro imediato, no proprio redirect.
 *
 * Chamado logo depois da reserva do primeiro acesso. Grava um unico registro
 * por convite e geracao: recarregar a pagina no mesmo aparelho nao cria
 * outro nem sobrescreve o que ja foi observado.
 */
export async function recordInviteFirstAccess(
  request: NextRequest,
  token: string,
): Promise<void> {
  try {
    const sinais = serverDeviceSignals(request);

    await callFunction<boolean>('cmd_invite_access_record', {
      p_token_hash: hashToken(token),
      p_user_agent: sinais.userAgent,
      p_accept_language: sinais.acceptLanguage,
      p_ip_hash: sinais.ipHash,
      p_device_type: sinais.deviceType,
      p_browser: sinais.browser,
      p_os: sinais.os,
      p_platform: sinais.platform,
    });
  } catch {
    // Sinal de auditoria: falhar aqui nao pode atrapalhar a abertura do link.
    // Sem log: qualquer mensagem poderia carregar cabecalhos do visitante.
  }
}

/**
 * Complementacao unica, vinda da pagina.
 *
 * So e aceita para a reserva correta (o SHA-256 do segredo do cookie
 * `HttpOnly`) e so enquanto a complementacao ainda nao chegou: repetir nao
 * sobrescreve nada. Devolve apenas se algo foi gravado — a tela nao usa esse
 * valor para decidir coisa alguma.
 */
export async function completeInviteAccessSignals(
  request: NextRequest,
  token: string,
  claimHash: string,
  signals: DeviceSignalsInput | undefined,
): Promise<boolean> {
  try {
    const userAgent = header(request, 'user-agent', 512);

    const resultado = await callFunction<boolean>('cmd_invite_access_signals', {
      p_token_hash: hashToken(token),
      p_claim_hash: claimHash,
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
      p_timezone: signals?.timezone ?? null,
      p_languages: signals?.language ?? null,
      p_max_touch_points: signals?.maxTouchPoints ?? null,
    });

    return resultado === true;
  } catch {
    // A falha ao coletar sinais complementares nao bloqueia o formulario: o
    // registro do primeiro clique ja existe desde o redirect.
    return false;
  }
}
