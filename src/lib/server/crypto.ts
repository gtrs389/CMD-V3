import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifra simetrica dos resultados da verificacao cadastral.
 *
 * AES-256-GCM com chave propria, em `MEMBER_VERIFICATION_ENCRYPTION_KEY`
 * (32 bytes em Base64). A chave nunca e a do Supabase nem a da FonteData e
 * nunca sai do servidor. Sem ela, nada e cifrado nem lido: a falha e segura e
 * explicita, jamais um texto em claro no banco.
 *
 * Formato guardado: base64(iv[12] | tag[16] | ciphertext).
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export class EncryptionConfigError extends Error {
  constructor() {
    super('Chave de criptografia da verificação ausente ou inválida.');
    this.name = 'EncryptionConfigError';
  }
}

function key(): Buffer {
  const raw = process.env.MEMBER_VERIFICATION_ENCRYPTION_KEY?.trim();
  if (!raw) throw new EncryptionConfigError();

  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length !== KEY_BYTES) throw new EncryptionConfigError();
  return decoded;
}

/** Verdadeiro quando a chave existe e tem o tamanho correto. */
export function hasEncryptionKey(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const content = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), content]).toString('base64');
}

/**
 * Le um valor cifrado. Conteudo adulterado ou chave trocada falham na
 * verificacao da etiqueta do GCM e devolvem `null`, nunca lixo.
 */
export function decryptJson<T>(payload: string | null | undefined): T | null {
  if (!payload) return null;

  try {
    const raw = Buffer.from(payload, 'base64');
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;

    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const content = raw.subarray(IV_BYTES + TAG_BYTES);

    const decipher = createDecipheriv(ALGORITHM, key(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(content), decipher.final()]).toString('utf8');
    return JSON.parse(plain) as T;
  } catch {
    return null;
  }
}
