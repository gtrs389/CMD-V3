/**
 * Leitura dos sinais tecnicos do aparelho para exibicao no painel.
 *
 * Regra de negocio pura, sem banco e sem rede. Trabalha apenas com o que a
 * rota do ADMIN devolve: nada de token, hash de IP ou identificador tecnico.
 */

export type DeviceStatus = 'OBSERVED' | 'TRUSTED' | 'BLOCKED';

/** Dados seguros de um aparelho, como chegam do servidor. */
export interface MemberDevice {
  platform: string | null;
  userAgent: string | null;
  isMobile: boolean | null;
  language: string | null;
  timezone: string | null;
  screenWidth: number | null;
  screenHeight: number | null;
  maxTouchPoints: number | null;
  country: string | null;
  region: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  status: DeviceStatus;
}

export const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  OBSERVED: 'Aparelho registrado',
  TRUSTED: 'Confiável',
  BLOCKED: 'Bloqueado',
};

/** Valor ausente aparece sempre do mesmo jeito. */
export const EMPTY = 'Não informado';

export function statusLabel(status: DeviceStatus): string {
  return DEVICE_STATUS_LABELS[status] ?? EMPTY;
}

/**
 * Tipo do aparelho.
 *
 * Combina o sinal de mobile, os pontos de toque e o User-Agent. Nenhum deles
 * e obrigatorio: sem informacao suficiente, devolve o texto neutro.
 */
export function deviceType(
  device: Pick<MemberDevice, 'userAgent' | 'isMobile' | 'maxTouchPoints'>,
): string {
  const ua = device.userAgent ?? '';

  if (/\bTablet\b|\biPad\b/i.test(ua)) return 'Tablet';
  if (device.isMobile === true) return 'Celular';
  if (/\bMobi\b|Android.*Mobile|iPhone/i.test(ua)) return 'Celular';
  if (device.isMobile === false) return 'Computador';

  // Sem sinal de mobile, os pontos de toque ainda ajudam.
  if (typeof device.maxTouchPoints === 'number') {
    return device.maxTouchPoints > 0 ? 'Aparelho com toque' : 'Computador';
  }
  return EMPTY;
}

/** Navegador, deduzido do User-Agent. Ordem importa: Edge e Opera fingem ser Chrome. */
export function browserName(userAgent: string | null): string {
  if (!userAgent) return EMPTY;

  if (/\bEdg[A-Za-z]*\//.test(userAgent)) return 'Edge';
  if (/\bOPR\/|\bOpera\b/.test(userAgent)) return 'Opera';
  if (/\bSamsungBrowser\//.test(userAgent)) return 'Samsung Internet';
  if (/\bFirefox\/|\bFxiOS\//.test(userAgent)) return 'Firefox';
  if (/\bChrome\/|\bCriOS\//.test(userAgent)) return 'Chrome';
  if (/\bSafari\//.test(userAgent)) return 'Safari';

  return EMPTY;
}

/** Sistema operacional, deduzido do User-Agent. Ordem importa: Android diz Linux. */
export function osName(userAgent: string | null): string | null {
  if (!userAgent) return null;

  if (/\bAndroid\b/.test(userAgent)) return 'Android';
  if (/\biPhone\b|\biPad\b|\biPod\b/.test(userAgent)) return 'iOS';
  if (/\bWindows\b/.test(userAgent)) return 'Windows';
  if (/\bMac OS X\b|\bMacintosh\b/.test(userAgent)) return 'macOS';
  if (/\bCrOS\b/.test(userAgent)) return 'ChromeOS';
  if (/\bLinux\b|\bX11\b/.test(userAgent)) return 'Linux';

  return null;
}

export function screenLabel(device: MemberDevice): string {
  const { screenWidth, screenHeight } = device;
  if (typeof screenWidth !== 'number' || typeof screenHeight !== 'number') return EMPTY;
  return `${screenWidth} x ${screenHeight}`;
}

export function locationLabel(device: MemberDevice): string {
  const parts = [device.region, device.country].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : EMPTY;
}

export function mobileLabel(isMobile: boolean | null): string {
  if (isMobile === null) return EMPTY;
  return isMobile ? 'Sim' : 'Não';
}

export function touchLabel(points: number | null): string {
  return typeof points === 'number' ? String(points) : EMPTY;
}

export function textOrEmpty(value: string | null): string {
  return value && value.trim() ? value : EMPTY;
}

/** Mais recente primeiro. */
export function byLastSeen(a: MemberDevice, b: MemberDevice): number {
  return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
}
