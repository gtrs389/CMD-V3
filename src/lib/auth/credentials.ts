import 'server-only';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { SessionUser } from '@/lib/types';

/**
 * Verificacao de credenciais do ADMIN.
 *
 * Provisorio por natureza: nao existe banco de dados nesta etapa. As
 * credenciais vivem em variaveis de ambiente do servidor e NUNCA chegam ao
 * navegador. Quando houver banco, basta trocar `verifyCredentials` por uma
 * consulta a tabela de usuarios — a interface de login nao muda.
 */

const SCRYPT_KEYLEN = 64;

/** Credencial usada apenas quando o ambiente nao define ADMIN_PASSWORD_HASH. */
const DEV_FALLBACK = {
  email: 'admin@exemplo.com',
  password: 'equipe123',
  name: 'Administrador',
};

let warned = false;

function warnOnce(): void {
  if (warned) return;
  warned = true;
  console.warn(
    '[auth] ADMIN_PASSWORD_HASH nao configurado. Usando credencial de demonstracao. ' +
      'Defina ADMIN_EMAIL e ADMIN_PASSWORD_HASH (npm run gerar-hash) antes de qualquer uso real.',
  );
}

/** Gera o valor de ADMIN_PASSWORD_HASH no formato `scrypt$salt$hash`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function safeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    // Mantem o custo constante mesmo com tamanhos diferentes.
    timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

function verifyHash(password: string, stored: string): boolean {
  const [scheme, salt, digest] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !digest) return false;
  try {
    const derived = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
    return safeEquals(derived, digest);
  } catch {
    return false;
  }
}

export interface CredentialsResult {
  user: SessionUser | null;
  /** Sinaliza que a credencial de demonstracao esta ativa. */
  usingFallback: boolean;
}

export function verifyCredentials(email: string, password: string): CredentialsResult {
  const configuredHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const configuredName = process.env.ADMIN_NAME?.trim();

  const normalizedEmail = email.trim().toLowerCase();
  const usingFallback = !configuredHash || !configuredEmail;

  if (usingFallback) warnOnce();

  const expectedEmail = usingFallback ? DEV_FALLBACK.email : (configuredEmail as string);
  const emailMatches = safeEquals(normalizedEmail, expectedEmail);

  const passwordMatches = usingFallback
    ? safeEquals(password, DEV_FALLBACK.password)
    : verifyHash(password, configuredHash as string);

  if (!emailMatches || !passwordMatches) {
    return { user: null, usingFallback };
  }

  return {
    user: {
      id: 'admin',
      name: configuredName || DEV_FALLBACK.name,
      email: expectedEmail,
      role: 'ADMIN',
    },
    usingFallback,
  };
}

/** Informa a interface que o ambiente ainda usa a credencial de demonstracao. */
export function isUsingFallbackCredentials(): boolean {
  return !process.env.ADMIN_PASSWORD_HASH?.trim() || !process.env.ADMIN_EMAIL?.trim();
}
