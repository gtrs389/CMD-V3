import 'server-only';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Tokens opacos usados em sessoes e convites.
 *
 * O valor original circula apenas no cookie (sessao) ou no link (convite).
 * O banco guarda somente o hash SHA-256, entao vazar a tabela nao permite
 * reconstruir nenhum token valido.
 */

const TOKEN_BYTES = 32;

/** Token aleatorio, seguro para uso criptografico, em base64url. */
export function createToken(bytes = TOKEN_BYTES): string {
  return randomBytes(bytes).toString('base64url');
}

/** Token curto para links de convite: legivel e ainda com 160 bits. */
export function createInviteToken(): string {
  return randomBytes(20).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
