import 'server-only';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Senhas com scrypt.
 *
 * Formato guardado em `cmd_users.password_hash`: `scrypt$<salt-hex>$<hash-hex>`.
 * O salt e aleatorio por usuario e a comparacao e feita em tempo constante.
 * MD5, SHA simples e texto puro nunca sao aceitos.
 */

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;
const SALT_BYTES = 16;

export const PASSWORD_MIN_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const derived = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

/** Compara dois valores hexadecimais em tempo constante. */
function constantTimeEqualHex(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'hex');
  const bufferB = Buffer.from(b, 'hex');
  if (bufferA.length !== bufferB.length || bufferA.length === 0) {
    timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Confere a senha contra o hash guardado.
 * Sempre executa o scrypt, mesmo com hash malformado, para nao vazar
 * pelo tempo de resposta se o usuario existe ou nao.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const [scheme, salt, digest] = (stored ?? '').split('$');
  const usable = scheme === 'scrypt' && Boolean(salt) && Boolean(digest);

  const effectiveSalt = usable ? salt : randomBytes(SALT_BYTES).toString('hex');
  const derived = await scrypt(password, effectiveSalt, KEYLEN);

  if (!usable) return false;
  return constantTimeEqualHex(derived.toString('hex'), digest);
}
