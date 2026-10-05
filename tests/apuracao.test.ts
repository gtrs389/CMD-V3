import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  decimalTse,
  mudancasEntre,
  resultadoDoCargo,
  retratoDe,
  seriesDaNoite,
  situacaoDoTse,
  vantagem,
  variacoes,
  type ResultadoDoCargo,
} from '@/lib/domain/apuracao';

/** Arquivos do ambiente simulado do TSE de 2026 (candidatos ficticios). */
const ler = (nome: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', 'tse', nome), 'utf8'));

describe('resultado de um cargo, no formato do TSE de 2026', () => {
  it('Senado: duas vagas, candidatos em ordem, foto, porcentagem e situação', () => {
    const r = resultadoDoCargo(ler('senador-sp-u.json'))!;
    expect(r).toMatchObject({ cargo: 5, nomeDoCargo: 'Senador', vagas: 2, final: true, versao: '176953242' });
    expect(r.atualizadoTse).toBe('29/09/2026 16:44:38');
    expect(r.secoes).toEqual({ total: 106580, totalizadas: 106580, pct: 100 });
    expect(r.eleitorado.pctComparecimento).toBeCloseTo(85.138, 2);
    expect(r.votos.brancos).toBe(2061455);
    expect(r.votos.pctNulos).toBeCloseTo(3.41, 2);

    // Ordem por votos, posicao a partir de 1, numeros coerentes.
    expect(r.candidatos[0].posicao).toBe(1);
    for (let i = 1; i < r.candidatos.length; i += 1) expect(r.candidatos[i - 1].votos).toBeGreaterThanOrEqual(r.candidatos[i].votos);
    const eleitos = r.candidatos.filter((c) => c.situacao === 'ELEITO');
    expect(eleitos.length).toBe(2);
    expect(eleitos.every((c) => c.posicao <= 2)).toBe(true);

    const c = r.candidatos.find((x) => x.numero === '862')!;
    expect(c).toMatchObject({ sqcand: '41627501', partido: 'P 9964', votos: 2057170, situacao: 'ELEITO', situacaoTse: 'Eleito' });
    expect(c.pct).toBeCloseTo(3.6272, 3);
    expect(c.companhia.map((x) => x.tipo)).toEqual(['s1', 's2']);
  });

  it('Presidente: uma vaga, com vice', () => {
    const r = resultadoDoCargo(ler('presidente-br-u.json'))!;
    expect(r).toMatchObject({ cargo: 1, vagas: 1 });
    expect(r.candidatos.length).toBeGreaterThan(5);
    expect(r.candidatos[0].companhia[0]?.tipo).toBe('v');
    expect(vantagem(r)!.votos).toBe(r.candidatos[0].votos - r.candidatos[1].votos);
  });

  it('antes do fim, "Não eleito" vira "Em apuração"; números com vírgula', () => {
    expect(situacaoDoTse('Não eleito', false)).toBe('EM_APURACAO');
    expect(situacaoDoTse('Não eleito', true)).toBe('NAO_ELEITO');
    expect(situacaoDoTse('Eleito por QP', false)).toBe('ELEITO');
    expect(situacaoDoTse('2º turno', false)).toBe('SEGUNDO_TURNO');
    expect(situacaoDoTse('Suplente', true)).toBe('SUPLENTE');
    expect(decimalTse('3,554974959')).toBeCloseTo(3.554974959, 9);
    expect(resultadoDoCargo({})).toBeNull();
  });
});

describe('a noite da apuração', () => {
  const base = resultadoDoCargo(ler('senador-sp-u.json'))!;
  const com = (votos: Record<string, number>, pct: number, final = false): ResultadoDoCargo => {
    const candidatos = base.candidatos
      .map((c) => ({ ...c, votos: votos[c.numero] ?? 0, situacao: 'EM_APURACAO' as const }))
      .sort((a, b) => b.votos - a.votos)
      .map((c, i) => ({ ...c, posicao: i + 1 }));
    return { ...base, final, secoes: { ...base.secoes, pct }, candidatos };
  };
  const [a, b, c] = base.candidatos.map((x) => x.numero);

  it('narra troca de liderança, ultrapassagem nas vagas e marcos de seções', () => {
    const antes = com({ [a]: 300, [b]: 200, [c]: 100 }, 20);
    const agora = com({ [a]: 300, [b]: 400, [c]: 350 }, 52);
    const textos = mudancasEntre(antes, agora).map((m) => m.tipo);
    expect(textos).toContain('LIDERANCA');
    expect(textos).toContain('ULTRAPASSAGEM');
    expect(mudancasEntre(antes, agora).find((m) => m.tipo === 'MARCO')?.texto).toBe('Senador: 50% das seções totalizadas');
  });

  it('sem mudança, sem notícia', () => {
    const x = com({ [a]: 300, [b]: 200 }, 30);
    expect(mudancasEntre(x, x)).toEqual([]);
  });

  it('o retrato guarda hora do TSE, seções e os líderes', () => {
    const r = retratoDe(base, '2026-10-04T23:00:00.000Z');
    expect(r.horaTse).toBe('16:44');
    expect(r.pctSecoes).toBe(100);
    expect(r.lideres[0][0]).toBe(base.candidatos[0].numero);
    expect(r.lideres.length).toBeLessThanOrEqual(12);
  });
});

describe('o que anda entre duas leituras', () => {
  const base = resultadoDoCargo(ler('senador-sp-u.json'))!;
  const [a, b] = base.candidatos;

  it('votos a mais e posições ganhas; mesma versão do TSE, nada anda', () => {
    const antes = { ...base, versao: 'v1', candidatos: base.candidatos.map((c) => ({ ...c })) };
    const agora = {
      ...base,
      versao: 'v2',
      candidatos: base.candidatos.map((c) =>
        c.numero === b.numero ? { ...c, votos: c.votos + 50_000, posicao: 1 } : c.numero === a.numero ? { ...c, posicao: 2 } : c,
      ),
    };
    const v = variacoes(antes, agora);
    expect(v.get(b.numero)).toEqual({ votos: 50_000, posicoes: 1 });
    expect(v.get(a.numero)).toEqual({ votos: 0, posicoes: -1 });
    expect(variacoes(antes, { ...agora, versao: 'v1' }).size).toBe(0);
    expect(variacoes(null, agora).size).toBe(0);
  });

  it('as séries da noite seguem o candidato, na ordem do número (a cor não troca quando alguém passa)', () => {
    const historico = [
      { em: '2026-10-04T21:00:00Z', horaTse: '18:00', pctSecoes: 10, lideres: [[a.numero, 10, 40], [b.numero, 9, 38]] as [string, number, number][] },
      { em: '2026-10-04T22:00:00Z', horaTse: '19:00', pctSecoes: 60, lideres: [[b.numero, 90, 45], [a.numero, 80, 41]] as [string, number, number][] },
    ];
    const series = seriesDaNoite(historico, base, 2);
    expect(series.map((s) => s.numero)).toEqual([a.numero, b.numero].sort((x, y) => x.localeCompare(y, 'pt-BR', { numeric: true })));
    const sa = series.find((s) => s.numero === a.numero)!;
    expect(sa.pontos).toEqual([
      { x: 10, y: 40, hora: '18:00' },
      { x: 60, y: 41, hora: '19:00' },
    ]);
  });
});
