import 'server-only';
import { randomBytes } from 'node:crypto';

/**
 * Senha temporaria do primeiro acesso.
 *
 * Sorteada com `crypto.randomBytes`, sem alfabeto ambiguo (0/O, 1/l/I) para
 * poder ser ditada sem erro. O valor existe apenas na memoria do servidor e
 * na resposta protegida da acao: nunca e gravado em banco, log, arquivo, URL
 * ou armazenamento do navegador. No banco fica somente o hash scrypt.
 */

const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*-+';
const ALPHABET = LOWER + UPPER + DIGITS + SYMBOLS;

export const TEMP_PASSWORD_LENGTH = 16;

/** Sorteio uniforme: rejeita os bytes que cairiam fora do alfabeto. */
function pick(alphabet: string): string {
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  for (;;) {
    for (const byte of randomBytes(32)) {
      if (byte < limit) return alphabet[byte % alphabet.length];
    }
  }
}

export function generateTempPassword(length = TEMP_PASSWORD_LENGTH): string {
  const total = Math.max(12, length);

  // Um caractere garantido de cada classe; o restante e sorteado livremente.
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  const rest = Array.from({ length: total - required.length }, () => pick(ALPHABET));
  const chars = [...required, ...rest];

  // Embaralhamento Fisher-Yates com a mesma fonte aleatoria.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}
