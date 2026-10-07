import { describe, expect, it } from 'vitest';
import { buscarEscolas } from '@/lib/domain/busca-de-escolas';

const escola = (chave: string, titulo: string, cidade: string, valor = 0) => ({ chave, titulo, endereco: null, cidade, valor });
const ESCOLAS = [
  escola('h', 'COLÉGIO ESTADUAL HUMBERTO MENDES', 'Palmeira dos Índios', 49),
  escola('c', 'COLÉGIO CRISTO REDENTOR', 'Palmeira dos Índios', 27),
  escola('m', 'ESCOLA MUNICIPAL HUMBERTO SANTOS', 'Arapiraca', 80),
  escola('f', 'FACULDADE CESMAC DO SERTÃO', 'Palmeira dos Índios', 5),
];

describe('busca de escolas no mapa', () => {
  it('sem acento e sem caixa; cada palavra precisa aparecer (nome ou cidade)', () => {
    expect(buscarEscolas(ESCOLAS, 'humberto palmeira').map((e) => e.chave)).toEqual(['h']);
    expect(buscarEscolas(ESCOLAS, 'sertao').map((e) => e.chave)).toEqual(['f']);
    expect(buscarEscolas(ESCOLAS, 'ARAPIRACA').map((e) => e.chave)).toEqual(['m']);
  });

  it('quem começa pelo termo vem primeiro; depois, quem tem mais gente', () => {
    expect(buscarEscolas(ESCOLAS, 'colegio').map((e) => e.chave)).toEqual(['h', 'c']);
    expect(buscarEscolas(ESCOLAS, 'humberto').map((e) => e.chave)).toEqual(['m', 'h']);
  });

  it('termo vazio não lista nada; o limite corta a lista', () => {
    expect(buscarEscolas(ESCOLAS, '  ')).toEqual([]);
    expect(buscarEscolas(ESCOLAS, 'o', 2)).toHaveLength(2);
  });
});
