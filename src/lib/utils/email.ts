/**
 * Normalizacao unica do e-mail em todo o sistema.
 *
 * Sempre em minusculas e sem espaco nas pontas: e a forma gravada em
 * `cmd_users.email` e em `cmd_members.email`, e a forma comparada em
 * qualquer conferencia de duplicidade.
 */

const EMAIL_PATTERN = /^[^@\s]{1,64}@[^@\s]{1,189}\.[a-z]{2,24}$/;

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** Mesmo formato aceito pelo CHECK do banco. */
export function isValidEmail(value: string | null | undefined): boolean {
  const normalized = normalizeEmail(value);
  return normalized.length >= 6 && normalized.length <= 254 && EMAIL_PATTERN.test(normalized);
}
