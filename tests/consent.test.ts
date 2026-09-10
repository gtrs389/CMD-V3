import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MAX_CONSENT_SNAPSHOT, canonicalPrivacyText } from '@/lib/domain/consent';

/** Mesmo calculo de `src/lib/server/consent.ts`, sem a camada de banco. */
const privacyHash = (snapshot: string) =>
  createHash('sha256').update(snapshot, 'utf8').digest('hex');

/**
 * A evidencia do consentimento so vale se o texto guardado for sempre o do
 * banco, montado de forma estavel. Estes testes travam esse formato.
 */

const base = {
  privacy_title: 'Aviso de privacidade',
  privacy_text: 'Coletamos nome e telefone para organizar a equipe.',
  privacy_require_consent: true,
  privacy_consent_label: 'Li e concordo.',
  form_updated_at: '2026-01-02T03:04:05.000Z',
};

describe('texto canonico do consentimento', () => {
  it('inclui título, aviso, rótulo, exigencia e versão', () => {
    const snapshot = canonicalPrivacyText(base);

    expect(snapshot).toContain('título: Aviso de privacidade');
    expect(snapshot).toContain('aviso: Coletamos nome e telefone para organizar a equipe.');
    expect(snapshot).toContain('consentimento: Li e concordo.');
    expect(snapshot).toContain('exige_aceite: sim');
    expect(snapshot).toContain('versão: 2026-01-02T03:04:05.000Z');
  });

  it('não muda quando o conteudo e o mesmo', () => {
    expect(canonicalPrivacyText(base)).toBe(canonicalPrivacyText({ ...base }));
  });

  it('muda quando qualquer parte do aviso muda', () => {
    const original = canonicalPrivacyText(base);

    expect(canonicalPrivacyText({ ...base, privacy_text: 'Outro texto.' })).not.toBe(original);
    expect(canonicalPrivacyText({ ...base, privacy_title: 'Outro título' })).not.toBe(original);
    expect(canonicalPrivacyText({ ...base, privacy_require_consent: false })).not.toBe(original);
    expect(canonicalPrivacyText({ ...base, form_updated_at: '2026-06-01T00:00:00.000Z' })).not.toBe(
      original,
    );
  });

  it('respeita o limite de tamanho da coluna', () => {
    const snapshot = canonicalPrivacyText({ ...base, privacy_text: 'x'.repeat(20000) });
    expect(MAX_CONSENT_SNAPSHOT).toBe(8000);
    expect(snapshot.length).toBeLessThanOrEqual(MAX_CONSENT_SNAPSHOT);
  });
});

describe('hash do consentimento', () => {
  it('e o SHA-256 hexadecimal do próprio snapshot', () => {
    const snapshot = canonicalPrivacyText(base);
    const esperado = createHash('sha256').update(snapshot, 'utf8').digest('hex');

    expect(privacyHash(snapshot)).toBe(esperado);
    expect(privacyHash(snapshot)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('muda junto com o texto', () => {
    const a = privacyHash(canonicalPrivacyText(base));
    const b = privacyHash(canonicalPrivacyText({ ...base, privacy_text: 'Outro texto.' }));

    expect(a).not.toBe(b);
  });
});
