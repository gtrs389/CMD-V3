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

/**
 * Menos digitos do que isto nao e um telefone incompleto: e outra coisa.
 *
 * Oito digitos sao um numero local sem DDD — a forma mais curta que ainda
 * da para corrigir depois olhando para ela.
 */
export const MIN_PHONE_DIGITS = 8;

/**
 * Telefone bom o bastante para um CADASTRO.
 *
 * Quem preenche o formulario no celular, na rua, erra um digito. Recusar
 * significa perder a pessoa: ela fecha a pagina e nao volta. Entao o
 * cadastro aceita o numero incompleto, e quem olha a ficha ve o aviso de
 * que ele precisa ser conferido.
 *
 * `isValidPhone` continua existindo e continua exigente: e ele que responde
 * pelo telefone que serve de CREDENCIAL — o do administrador do time e o do
 * integrante que entra pelo link do time. Numero pela metade nao abre
 * porta, e o banco tambem nao aceita.
 */
export function isUsablePhone(input: string): boolean {
  const digits = normalizePhone(input);
  return digits.length >= MIN_PHONE_DIGITS && digits.length <= 11;
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
