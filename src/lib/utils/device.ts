/**
 * Sinais tecnicos do aparelho, lidos na propria pagina.
 *
 * Sao apenas dados que o navegador ja expoe a qualquer site. Nada invasivo:
 * sem MAC, IMEI, numero de serie, GPS, contatos, aplicativos instalados,
 * canvas fingerprint ou WebGL fingerprint.
 *
 * Qualquer campo pode faltar. A ausencia nunca impede o cadastro: o envio
 * segue mesmo que esta funcao devolva um objeto vazio.
 */
export interface DeviceSignals {
  platform?: string;
  isMobile?: boolean;
  language?: string;
  /** Todos os idiomas do navegador, em uma linha. */
  languages?: string;
  timezone?: string;
  screenWidth?: number;
  screenHeight?: number;
  /** Area visivel da pagina. Usada no registro de cliques (migration 021). */
  viewportWidth?: number;
  viewportHeight?: number;
  maxTouchPoints?: number;
}

function positiveInt(value: unknown, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  return rounded >= 0 && rounded <= max ? rounded : undefined;
}

export function collectDeviceSignals(): DeviceSignals {
  if (typeof window === 'undefined') return {};

  try {
    const signals: DeviceSignals = {};

    const platform = navigator.userAgentData?.platform ?? navigator.platform;
    if (typeof platform === 'string' && platform) signals.platform = platform.slice(0, 64);

    if (typeof navigator.userAgentData?.mobile === 'boolean') {
      signals.isMobile = navigator.userAgentData.mobile;
    }

    if (navigator.language) signals.language = navigator.language.slice(0, 32);

    if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
      signals.languages = navigator.languages.join(', ').slice(0, 128);
    }

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone) signals.timezone = timezone.slice(0, 64);

    signals.screenWidth = positiveInt(window.screen?.width, 100000);
    signals.screenHeight = positiveInt(window.screen?.height, 100000);
    signals.viewportWidth = positiveInt(window.innerWidth, 100000);
    signals.viewportHeight = positiveInt(window.innerHeight, 100000);
    signals.maxTouchPoints = positiveInt(navigator.maxTouchPoints, 64);

    return signals;
  } catch {
    // Navegador restritivo: seguimos sem nenhum sinal.
    return {};
  }
}
