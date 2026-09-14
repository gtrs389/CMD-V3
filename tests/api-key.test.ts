import { describe, expect, it } from 'vitest';
import {
  API_KEY_MARK,
  API_KEY_SECRET_CHARS,
  apiKeyPrefix,
  bearerToken,
  isApiKeyFormat,
  maskApiKey,
} from '@/lib/domain/api-key';

/** Segredo com o mesmo formato do que o servidor gera (32 bytes base64url). */
const CHAVE = `${API_KEY_MARK}${'a'.repeat(API_KEY_SECRET_CHARS)}`;

describe('formato da chave da API', () => {
  it('aceita apenas a marca do sistema com o tamanho exato', () => {
    expect(isApiKeyFormat(CHAVE)).toBe(true);

    expect(isApiKeyFormat('')).toBe(false);
    expect(isApiKeyFormat(null)).toBe(false);
    expect(isApiKeyFormat(undefined)).toBe(false);
    // Sem a marca, curta demais, longa demais ou com caractere fora do base64url.
    expect(isApiKeyFormat('a'.repeat(API_KEY_SECRET_CHARS))).toBe(false);
    expect(isApiKeyFormat(`${API_KEY_MARK}abc`)).toBe(false);
    expect(isApiKeyFormat(`${CHAVE}a`)).toBe(false);
    expect(isApiKeyFormat(`${API_KEY_MARK}${'+'.repeat(API_KEY_SECRET_CHARS)}`)).toBe(false);
  });

  it('guarda só o começo do segredo no prefixo', () => {
    const prefixo = apiKeyPrefix(CHAVE);

    expect(prefixo).toBe(`${API_KEY_MARK}aaaaaaaa`);
    expect(prefixo.length).toBe(API_KEY_MARK.length + 8);
    // O prefixo nunca pode bastar para reconstruir a chave.
    expect(CHAVE.startsWith(prefixo)).toBe(true);
    expect(prefixo.length).toBeLessThan(CHAVE.length);
    expect(isApiKeyFormat(prefixo)).toBe(false);
  });

  it('mostra a chave sem revelar o segredo', () => {
    const exibida = maskApiKey(apiKeyPrefix(CHAVE));

    expect(exibida.startsWith(`${API_KEY_MARK}aaaaaaaa`)).toBe(true);
    expect(exibida).not.toContain('a'.repeat(9));
  });
});

describe('cabeçalho Authorization', () => {
  it('lê o esquema Bearer em qualquer caixa', () => {
    expect(bearerToken(`Bearer ${CHAVE}`)).toBe(CHAVE);
    expect(bearerToken(`bearer ${CHAVE}`)).toBe(CHAVE);
    expect(bearerToken(`  BEARER   ${CHAVE}  `)).toBe(CHAVE);
  });

  it('recusa outro esquema, cabeçalho ausente e valor fora do formato', () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken('')).toBeNull();
    expect(bearerToken(CHAVE)).toBeNull();
    expect(bearerToken(`Basic ${CHAVE}`)).toBeNull();
    expect(bearerToken('Bearer')).toBeNull();
    expect(bearerToken('Bearer nao-e-uma-chave')).toBeNull();
    // Senha de usuario, token de sessao ou qualquer outro segredo do sistema
    // nao passa por aqui: sem a marca, nem chega a ser consultado no banco.
    expect(bearerToken(`Bearer ${'x'.repeat(43)}`)).toBeNull();
  });
});
