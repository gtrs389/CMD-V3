import type { Role, SessionUser } from '@/lib/types';
import { SESSION_MAX_AGE } from './constants';

/**
 * Sessao provisoria assinada com HMAC-SHA256.
 *
 * Nao ha banco de dados nesta etapa: o cookie carrega apenas identificacao
 * e perfil, e a assinatura impede adulteracao no navegador. O modulo usa
 * apenas Web Crypto, para funcionar tanto nas rotas de API quanto no proxy.
 */

export interface SessionPayload extends SessionUser {
  /** Emitido em (epoch, segundos). */
  iat: number;
  /** Expira em (epoch, segundos). */
  exp: number;
}

const DEV_SECRET = 'chave-de-desenvolvimento-trocar-em-producao';

let warnedAboutSecret = false;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (value && value.length >= 16) return value;

  if (!warnedAboutSecret && process.env.NODE_ENV === 'production') {
    warnedAboutSecret = true;
    console.warn(
      '[auth] AUTH_SECRET ausente ou muito curto. Usando chave de desenvolvimento. ' +
        'Configure AUTH_SECRET antes de expor o sistema.',
    );
  }

  return DEV_SECRET;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    ...user,
    iat: issuedAt,
    exp: issuedAt + SESSION_MAX_AGE,
  };

  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(),
    new TextEncoder().encode(body),
  );

  return `${body}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function readSessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;

  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  try {
    const expected = await crypto.subtle.sign(
      'HMAC',
      await hmacKey(),
      new TextEncoder().encode(body),
    );
    if (!constantTimeEqual(signature, bytesToBase64Url(new Uint8Array(expected)))) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as SessionPayload;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
    if (!payload.id || !payload.email || !payload.role) return null;

    return payload;
  } catch {
    return null;
  }
}

export function toSessionUser(payload: SessionPayload): SessionUser {
  return {
    id: payload.id,
    name: payload.name,
    email: payload.email,
    role: payload.role as Role,
  };
}
