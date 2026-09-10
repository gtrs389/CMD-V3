import { describe, expect, it } from 'vitest';
import {
  EMPTY,
  browserName,
  byLastSeen,
  deviceType,
  locationLabel,
  mobileLabel,
  screenLabel,
  statusLabel,
  textOrEmpty,
  touchLabel,
  type MemberDevice,
} from '@/lib/domain/device-summary';

/**
 * A ficha precisa aguentar registros incompletos sem quebrar, e nunca
 * inventar informacao que o aparelho nao forneceu.
 */

const vazio: MemberDevice = {
  platform: null,
  userAgent: null,
  isMobile: null,
  language: null,
  timezone: null,
  screenWidth: null,
  screenHeight: null,
  maxTouchPoints: null,
  country: null,
  region: null,
  firstSeenAt: '2026-01-01T00:00:00.000Z',
  lastSeenAt: '2026-01-01T00:00:00.000Z',
  status: 'OBSERVED',
};

describe('tipo do dispositivo', () => {
  it('usa o sinal de mobile quando existe', () => {
    expect(deviceType({ ...vazio, isMobile: true })).toBe('Celular');
    expect(deviceType({ ...vazio, isMobile: false })).toBe('Computador');
  });

  it('reconhece tablet pelo User-Agent, mesmo com mobile ligado', () => {
    expect(deviceType({ ...vazio, isMobile: true, userAgent: 'Mozilla/5.0 (iPad)' })).toBe('Tablet');
  });

  it('cai para o User-Agent quando nao ha sinal de mobile', () => {
    expect(deviceType({ ...vazio, userAgent: 'Android 14; Mobile Safari' })).toBe('Celular');
  });

  it('usa os pontos de toque como ultimo recurso', () => {
    expect(deviceType({ ...vazio, maxTouchPoints: 5 })).toBe('Aparelho com toque');
    expect(deviceType({ ...vazio, maxTouchPoints: 0 })).toBe('Computador');
  });

  it('sem nenhum sinal, nao inventa', () => {
    expect(deviceType(vazio)).toBe(EMPTY);
  });
});

describe('navegador', () => {
  it('distingue os que se passam por Chrome', () => {
    expect(browserName('Chrome/140 Safari/537 Edg/140')).toBe('Edge');
    expect(browserName('Chrome/140 Safari/537 OPR/120')).toBe('Opera');
    expect(browserName('Chrome/140 SamsungBrowser/25 Safari/537')).toBe('Samsung Internet');
    expect(browserName('Mozilla/5.0 Chrome/140 Safari/537')).toBe('Chrome');
  });

  it('reconhece Firefox e Safari', () => {
    expect(browserName('Mozilla/5.0 Firefox/130')).toBe('Firefox');
    expect(browserName('Mozilla/5.0 (iPhone) Version/17 Safari/605')).toBe('Safari');
  });

  it('sem User-Agent, nao inventa', () => {
    expect(browserName(null)).toBe(EMPTY);
    expect(browserName('algo-desconhecido')).toBe(EMPTY);
  });
});

describe('rotulos', () => {
  it('formata os campos presentes', () => {
    expect(screenLabel({ ...vazio, screenWidth: 390, screenHeight: 844 })).toBe('390 x 844');
    expect(locationLabel({ ...vazio, country: 'BR', region: 'SP' })).toBe('SP / BR');
    expect(mobileLabel(true)).toBe('Sim');
    expect(mobileLabel(false)).toBe('Nao');
    expect(touchLabel(0)).toBe('0');
    expect(statusLabel('OBSERVED')).toBe('Em observacao');
  });

  it('marca como ausente o que nao veio', () => {
    expect(screenLabel({ ...vazio, screenWidth: 390 })).toBe(EMPTY);
    expect(locationLabel(vazio)).toBe(EMPTY);
    expect(mobileLabel(null)).toBe(EMPTY);
    expect(touchLabel(null)).toBe(EMPTY);
    expect(textOrEmpty('   ')).toBe(EMPTY);
    expect(textOrEmpty(null)).toBe(EMPTY);
  });
});

describe('ordenacao', () => {
  it('coloca a atividade mais recente primeiro', () => {
    const antigo = { ...vazio, lastSeenAt: '2026-01-01T00:00:00.000Z' };
    const recente = { ...vazio, lastSeenAt: '2026-06-01T00:00:00.000Z' };

    expect([antigo, recente].sort(byLastSeen)).toEqual([recente, antigo]);
  });
});
