import { describe, expect, it } from 'vitest';
import { deviceSignalsSchema } from '@/lib/validation/server.schema';

/**
 * O registro do aparelho e sinal de seguranca. Estes testes cobrem o que
 * importa: nada obrigatorio, nada invasivo e limites respeitados.
 */

describe('sinais do aparelho', () => {
  it('aceita a ausencia total de sinais', () => {
    const parsed = deviceSignalsSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it('aceita um conjunto parcial', () => {
    const parsed = deviceSignalsSchema.safeParse({ language: 'pt-BR', isMobile: true });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.language).toBe('pt-BR');
      expect(parsed.data.platform).toBeUndefined();
    }
  });

  it('aceita o conjunto completo previsto', () => {
    const parsed = deviceSignalsSchema.safeParse({
      platform: 'Android',
      isMobile: true,
      language: 'pt-BR',
      timezone: 'America/Sao_Paulo',
      screenWidth: 390,
      screenHeight: 844,
      maxTouchPoints: 5,
    });
    expect(parsed.success).toBe(true);
  });

  it('descarta qualquer campo nao previsto', () => {
    const parsed = deviceSignalsSchema.safeParse({
      language: 'pt-BR',
      canvasFingerprint: 'abc',
      gps: { lat: -23.5, lng: -46.6 },
      imei: '123456789012345',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(Object.keys(parsed.data)).toEqual(['language']);
    }
  });

  it('recusa valores fora dos limites das colunas', () => {
    expect(deviceSignalsSchema.safeParse({ screenWidth: 0 }).success).toBe(false);
    expect(deviceSignalsSchema.safeParse({ screenWidth: 100001 }).success).toBe(false);
    expect(deviceSignalsSchema.safeParse({ maxTouchPoints: -1 }).success).toBe(false);
    expect(deviceSignalsSchema.safeParse({ maxTouchPoints: 65 }).success).toBe(false);
    expect(deviceSignalsSchema.safeParse({ screenHeight: 12.5 }).success).toBe(false);
  });

  it('corta textos no tamanho aceito pelo banco', () => {
    const parsed = deviceSignalsSchema.safeParse({ timezone: 'x'.repeat(200) });
    expect(parsed.success).toBe(false);
  });
});
