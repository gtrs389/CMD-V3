/** Utilitarios de telefone no formato brasileiro. */

/** Remove tudo que nao for digito e descarta o prefixo 55 quando redundante. */
export function normalizePhone(input: string): string {
  const digits = (input ?? '').replace(/\D/g, '');
  if (digits.length > 11 && digits.startsWith('55')) {
    return digits.slice(2, 13);
  }
  return digits.slice(0, 11);
}

/** Aplica a mascara (00) 00000-0000 progressivamente, para uso durante a digitacao. */
export function maskPhone(input: string): string {
  const digits = normalizePhone(input);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  const area = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (rest.length <= 4) return `(${area}) ${rest}`;
  if (rest.length <= 8) return `(${area}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${area}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
}

/** Valida telefone fixo (10 digitos) ou celular (11 digitos, com 9 inicial). */
export function isValidPhone(input: string): boolean {
  const digits = normalizePhone(input);
  if (digits.length !== 10 && digits.length !== 11) return false;
  const area = Number(digits.slice(0, 2));
  if (area < 11 || area > 99) return false;
  if (digits.length === 11 && digits[2] !== '9') return false;
  return true;
}

/** Versao para exibicao. Retorna o valor original quando nao reconhecido. */
export function formatPhone(input: string): string {
  const digits = normalizePhone(input);
  if (digits.length !== 10 && digits.length !== 11) return input ?? '';
  return maskPhone(digits);
}
