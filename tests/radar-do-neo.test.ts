import { describe, expect, it } from 'vitest';
import { candidatoDoRotulo, correlacao, radarDoNeo } from '@/lib/domain/radar-do-neo';
import type { SecaoNoDuelo } from '@/lib/domain/sala-de-confronto';

const secao = (secao: string, estimativa: number, esquerda: number[], direita: number[]): SecaoNoDuelo => {
  const te = esquerda.reduce((t, n) => t + n, 0);
  const td = direita.reduce((t, n) => t + n, 0);
  return {
    chave: `10/${secao}`,
    zona: '10',
    secao,
    estimativa,
    dosLideres: 0,
    esquerda,
    direita,
    totalEsquerda: te,
    totalDireita: td,
    saldo: te - td,
    vencedor: te > td ? 'ESQUERDA' : te < td ? 'DIREITA' : te === 0 ? 'SEM_VOTOS' : 'EMPATE',
  };
};

const NIVALDO = candidatoDoRotulo('NIVALDO ALBUQUERQUE', 'NIVALDO ALBUQUERQUE (4400) · Deputado Federal · 1º turno');
const PAULINHO = candidatoDoRotulo('PAULINHO MENDONÇA', 'PAULINHO MENDONÇA (15100) · Deputado Estadual · 1º turno');
const SILVIO = candidatoDoRotulo('SILVIO CAMELO', 'SILVIO CAMELO (43123) · Deputado Estadual · 1º turno');

describe('o radar do NEO', () => {
  it('lê o número e o cargo do rótulo', () => {
    expect(NIVALDO).toEqual({ nome: 'NIVALDO ALBUQUERQUE', cargo: 'Deputado Federal', numero: '4400' });
  });

  it('o espelho: o time tinha 14, o nosso teve 0 e o adversário teve 14', () => {
    const r = radarDoNeo({
      secoes: [secao('229', 14, [0, 6], [14])],
      esquerda: [NIVALDO, PAULINHO],
      direita: [SILVIO],
      lideres: [{ nome: 'Félix Silva', porSecao: { '10/229': 9 } }],
    });
    const espelho = r.achados.find((a) => a.tipo === 'ESPELHO')!;
    expect(espelho.gravidade).toBe('alta');
    expect(espelho.titulo).toContain('exata');
    expect(espelho.texto).toContain('NIVALDO ALBUQUERQUE (Deputado Federal) teve 0 votos');
    expect(espelho.texto).toContain('Félix Silva (9 de 14)');
    expect(r.coincidenciasExatas).toEqual(['10/229']);
    // O espelho vem antes de tudo.
    expect(r.achados[0].tipo).toBe('ESPELHO');
  });

  it('zerada, tomada, dobradinha quebrada e superação', () => {
    const r = radarDoNeo({
      secoes: [
        secao('1', 10, [0, 8], [3]), // Nivaldo zerou
        secao('2', 20, [4, 5], [18]), // o adversário levou
        secao('3', 10, [9, 1], [2]), // votaram no federal e não no estadual
        secao('4', 6, [12, 7], [1]), // passou da gente do time
        secao('5', 3, [0, 0], [3]), // pouca gente: não cobra
      ],
      esquerda: [NIVALDO, PAULINHO],
      direita: [SILVIO],
    });
    const tipos = r.achados.map((a) => `${a.tipo}:${a.numeroDaSecao}`);
    expect(tipos).toContain('ZERADA:1');
    expect(tipos).toContain('TOMADA:2');
    expect(tipos).toContain('DOBRADINHA:3');
    expect(tipos).toContain('SUPERACAO:4');
    expect(tipos.some((t) => t.endsWith(':5'))).toBe(false);
    expect(r.achados.at(-1)?.gravidade).toBe('boa');
  });

  it('a tendência: onde o time tem mais gente, quem cresce é o adversário', () => {
    const r = radarDoNeo({
      secoes: [secao('1', 2, [2], [2]), secao('2', 6, [1], [6]), secao('3', 10, [2], [9]), secao('4', 15, [1], [14])],
      esquerda: [NIVALDO],
      direita: [SILVIO],
    });
    expect(r.alertaDeTendencia?.adversario).toBe('SILVIO CAMELO');
    expect(r.alertaDeTendencia!.rAdversario).toBeGreaterThan(0.9);
    expect(r.tendencias.find((t) => t.lado === 'nosso')?.votos).toBe(6);
  });

  it('correlação: precisa de 4 pontos e de variação', () => {
    expect(correlacao([1, 2, 3], [1, 2, 3])).toBeNull();
    expect(correlacao([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull();
    expect(correlacao([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
  });
});
