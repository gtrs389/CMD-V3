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

  it('reparte TUDO por padrao: a gente nova foi trazida por eles', () => {
    // A segunda camada ACRESCENTA pessoas ao time, e todas elas vieram de
    // algum recrutador — nao ha sobra a deixar com o administrador, cujos
    // cadastros continuam intactos porque nao sao tocados.
    const pessoas = 300;
    const levado = shareAmongRecruiters(5, pessoas).reduce((s, f) => s + f.count, 0);

    expect(levado).toBe(pessoas);
  });

  it('a fracao pode ser outra, quando quem chama pedir', () => {
    const levado = shareAmongRecruiters(5, 1000, 0.6).reduce((s, f) => s + f.count, 0);

    expect(levado).toBe(600);
    expect(levado).toBeLessThan(1000);
  });

  it('a soma fecha: ninguem fica de fora no arredondamento', () => {
    for (const [recrutadores, pessoas] of [
      [3, 100],
      [7, 999],
      [1, 50],
      [11, 137],
    ]) {
      const fatias = shareAmongRecruiters(recrutadores, pessoas);
      const soma = fatias.reduce((s, f) => s + f.count, 0);
      // Cada pessoa gerada precisa ter um responsavel.
      expect(soma).toBe(pessoas);
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
