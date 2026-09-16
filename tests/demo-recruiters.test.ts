import { describe, expect, it } from 'vitest';
import {
  clampRecruiters,
  shareAmongRecruiters,
  DEMO_RECRUITERS_MAX,
} from '@/lib/domain/demo-recruiters';

/**
 * A segunda camada existe para UM quadro: o "Ranking de cadastros equipe".
 * Ele mostra quem esta trazendo gente — e so mostra alguma coisa se os
 * numeros forem diferentes entre si.
 */

describe('divisao entre os recrutadores', () => {
  it('sem recrutador, ninguem leva nada', () => {
    expect(shareAmongRecruiters(0, 1000)).toEqual([]);
    expect(shareAmongRecruiters(5, 0)).toEqual([]);
  });

  it('e DESIGUAL: um ranking empatado nao demonstra nada', () => {
    const fatias = shareAmongRecruiters(5, 1000);
    const contagens = fatias.map((f) => f.count);

    expect(new Set(contagens).size).toBeGreaterThan(1);
    // Decrescente: o primeiro traz mais que o ultimo.
    expect(contagens[0]).toBeGreaterThan(contagens[contagens.length - 1]);
  });

  it('o administrador continua com cadastros proprios', () => {
    const disponiveis = 1000;
    const levado = shareAmongRecruiters(5, disponiveis).reduce((s, f) => s + f.count, 0);

    // Se a equipe levasse tudo, a demonstracao mostraria um administrador que
    // nao trouxe ninguem.
    expect(levado).toBeLessThan(disponiveis);
    expect(levado).toBeGreaterThan(0);
  });

  it('a soma fecha: nenhum cadastro se perde no arredondamento', () => {
    for (const [recrutadores, disponiveis] of [
      [3, 100],
      [7, 999],
      [1, 50],
      [11, 137],
    ]) {
      const fatias = shareAmongRecruiters(recrutadores, disponiveis);
      const soma = fatias.reduce((s, f) => s + f.count, 0);
      expect(soma).toBe(Math.floor(disponiveis * 0.6));
      expect(fatias.every((f) => f.count >= 0)).toBe(true);
    }
  });

  it('e deterministico: refazer nao embaralha o ranking', () => {
    expect(shareAmongRecruiters(6, 480)).toEqual(shareAmongRecruiters(6, 480));
  });
});

describe('quantos recrutadores cabem', () => {
  it('nunca mais recrutadores do que gente', () => {
    // Um recrutador E um integrante: ele nao pode recrutar a si mesmo.
    expect(clampRecruiters(10, 5)).toBe(4);
    expect(clampRecruiters(3, 1)).toBe(0);
  });

  it('respeita o teto', () => {
    expect(clampRecruiters(9999, 5000)).toBe(DEMO_RECRUITERS_MAX);
  });

  it('zero, negativo e quebrado viram zero ou inteiro', () => {
    expect(clampRecruiters(0, 100)).toBe(0);
    expect(clampRecruiters(-5, 100)).toBe(0);
    expect(clampRecruiters(3.9, 100)).toBe(3);
  });
});
