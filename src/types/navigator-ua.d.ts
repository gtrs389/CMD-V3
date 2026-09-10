/**
 * Recorte minimo da User-Agent Client Hints API, ainda ausente do lib.dom
 * desta versao do TypeScript. Somente os campos que o CMD le.
 */
interface NavigatorUAData {
  readonly platform?: string;
  readonly mobile?: boolean;
}

interface Navigator {
  readonly userAgentData?: NavigatorUAData;
}
