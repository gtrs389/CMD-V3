const ALPHABET = 'abcdefghijkmnopqrstuvwxyz0123456789';

function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < size; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/** Identificador curto e aleatorio, usado para entidades locais. */
export function createId(prefix = ''): string {
  const bytes = randomBytes(12);
  let out = '';
  for (const byte of bytes) {
    out += ALPHABET[byte % ALPHABET.length];
  }
  return prefix ? `${prefix}_${out}` : out;
}

/**
 * Token opaco do convite. Nao deriva de nenhum dado pessoal,
 * portanto o link publico nunca expoe informacao do cliente.
 */
export function createInviteToken(): string {
  const bytes = randomBytes(20);
  let out = '';
  for (const byte of bytes) {
    out += ALPHABET[byte % ALPHABET.length];
  }
  return out;
}
