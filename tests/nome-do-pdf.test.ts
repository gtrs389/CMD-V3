import { describe, expect, it } from 'vitest';
import { nomeDoPdf, nomeDoPdfDeInconsistencia } from '@/lib/domain/nome-do-pdf';

describe('nome do PDF de inconsistências', () => {
  const lideres = [
    'VIVIAN BEATRIZ MONTEIRO DE LEMOS SILVA · Líder',
    'Alex araujo da silva · Líder',
    'Alex Santos · Líder',
    'Jirlene Rodrigues de Melo · Líder',
    'Hugo · Líder',
  ];

  it('primeiro nome, minúsculo e sem acento', () => {
    expect(nomeDoPdfDeInconsistencia(lideres[0], lideres)).toBe('inconsistência_vivian.pdf');
    expect(nomeDoPdfDeInconsistencia(lideres[3], lideres)).toBe('inconsistência_jirlene.pdf');
    expect(nomeDoPdfDeInconsistencia(lideres[4], lideres)).toBe('inconsistência_hugo.pdf');
    expect(nomeDoPdfDeInconsistencia('ÂNGELA SOUZA', [])).toBe('inconsistência_angela.pdf');
  });

  it('dois com o mesmo primeiro nome ganham o sobrenome seguinte', () => {
    expect(nomeDoPdfDeInconsistencia(lideres[1], lideres)).toBe('inconsistência_alex_araujo.pdf');
    expect(nomeDoPdfDeInconsistencia(lideres[2], lideres)).toBe('inconsistência_alex_santos.pdf');
  });

  it('sem nome, cai no time', () => {
    expect(nomeDoPdfDeInconsistencia('', [])).toBe('inconsistência_time.pdf');
  });
});

describe('nome dos PDFs do mapa', () => {
  it('a Equipe do Líder segue o mesmo jeito: equipe_felix.pdf', () => {
    expect(nomeDoPdf('equipe', 'Félix Silva Targino')).toBe('equipe_felix.pdf');
    expect(nomeDoPdf('equipe', 'Alex Araujo', ['Alex Souza'])).toBe('equipe_alex_araujo.pdf');
  });
});

