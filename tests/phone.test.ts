import { describe, expect, it } from 'vitest';
import { formatPhone, isValidPhone, maskPhone, normalizePhone } from '@/lib/utils/phone';

describe('normalizePhone', () => {
  it('mantem apenas digitos', () => {
    expect(normalizePhone('(11) 98765-4321')).toBe('11987654321');
  });

  it('remove o prefixo internacional 55', () => {
    expect(normalizePhone('+55 (11) 98765-4321')).toBe('11987654321');
  });

  it('limita a 11 digitos', () => {
    expect(normalizePhone('119876543210000')).toHaveLength(11);
  });
});

describe('maskPhone', () => {
  it('aplica a máscara de celular', () => {
    expect(maskPhone('11987654321')).toBe('(11) 98765-4321');
  });

  it('aplica a máscara de telefone fixo', () => {
    expect(maskPhone('1133334444')).toBe('(11) 3333-4444');
  });

  it('funciona durante a digitacao', () => {
    expect(maskPhone('11')).toBe('(11');
    expect(maskPhone('119')).toBe('(11) 9');
  });
});

describe('isValidPhone', () => {
  it('aceita celular e fixo validos', () => {
    expect(isValidPhone('(11) 98765-4321')).toBe(true);
    expect(isValidPhone('(11) 3333-4444')).toBe(true);
  });

  it('recusa DDD inválido, tamanho errado e celular sem o 9', () => {
    expect(isValidPhone('(01) 98765-4321')).toBe(false);
    expect(isValidPhone('1198765')).toBe(false);
    expect(isValidPhone('11887654321')).toBe(false);
  });
});

describe('formatPhone', () => {
  it('devolve o valor original quando não reconhece', () => {
    expect(formatPhone('123')).toBe('123');
  });
});
