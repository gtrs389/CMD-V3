import { describe, expect, it } from 'vitest';
import { parseChatFill, resumoDoPreenchimento } from '@/lib/domain/chat-fill';
import { isValidVoterId } from '@/lib/utils/documents';

/**
 * Cadastro escrito de uma vez so, como quem manda uma mensagem.
 *
 * O que estes testes protegem e uma coisa: NADA E ADIVINHADO. Um numero que
 * nao passa na validacao do titulo nao vira titulo, e um pedaco que o
 * reconhecedor nao entendeu volta para a tela em vez de virar nome de
 * alguem.
 */

/** Titulo de verdade, com os digitos verificadores certos. */
const TITULO = '100000002720';

describe('reconhecimento da mensagem', () => {
  it('o título sozinho basta: é a mensagem mais curta que existe', () => {
    const lido = parseChatFill(TITULO);
    expect(lido.voterId).toBe(TITULO);
    expect(resumoDoPreenchimento(lido)).toEqual(['título']);
  });

  it('aceita o título com a máscara que as pessoas escrevem', () => {
    expect(parseChatFill('1000 0000 2720').voterId).toBe(TITULO);
    expect(parseChatFill('título: 1000 0000 2720').voterId).toBe(TITULO);
  });

  it('a mensagem inteira, em uma linha', () => {
    const lido = parseChatFill(
      `Maria da Silva Souza, 82 99999-0001, título ${TITULO}, zona 44 seção 3, Rua das Flores 100`,
    );

    expect(lido.name).toBe('Maria da Silva Souza');
    expect(lido.phone).toBe('82999990001');
    expect(lido.voterId).toBe(TITULO);
    expect(lido.zone).toBe('44');
    expect(lido.section).toBe('3');
    expect(lido.address).toBe('Rua das Flores 100');
    expect(lido.sobrou).toEqual([]);
  });

  it('a mesma mensagem quebrada em linhas, com rótulos', () => {
    const lido = parseChatFill(
      [
        'Nome: João Pedro Alves',
        'Telefone: (82) 98888-7777',
        `Titulo de eleitor: ${TITULO}`,
        'Zona: 044',
        'Seção: 0003',
        'Endereço: Travessa do Sol, 42 - Centro',
      ].join('\n'),
    );

    expect(lido.name).toBe('João Pedro Alves');
    expect(lido.phone).toBe('82988887777');
    expect(lido.voterId).toBe(TITULO);
    // Zero à frente não é outro número, aqui como em todo o resto.
    expect(lido.zone).toBe('44');
    expect(lido.section).toBe('3');
    expect(lido.address).toContain('Travessa do Sol');
  });

  it('zona e seção no mesmo pedaço', () => {
    const lido = parseChatFill('zona 12 secao 45');
    expect(lido.zone).toBe('12');
    expect(lido.section).toBe('45');
  });

  it('telefone sozinho é telefone; doze dígitos são título', () => {
    expect(parseChatFill('82999990001').phone).toBe('82999990001');
    expect(parseChatFill('8233334444').phone).toBe('8233334444');
    expect(parseChatFill(TITULO).phone).toBeNull();
  });

  it('número que não passa na validação não vira nada', () => {
    // Doze dígitos com verificador errado: não é título, e não é telefone.
    const invalido = '123456789012';
    expect(isValidVoterId(invalido)).toBe(false);

    const lido = parseChatFill(invalido);
    expect(lido.voterId).toBeNull();
    expect(lido.phone).toBeNull();
    // Volta para a tela em vez de sumir calado.
    expect(lido.sobrou).toContain(invalido);
  });

  it('uma palavra só não vira nome', () => {
    // "Centro" é pedaço de endereço, não gente.
    const lido = parseChatFill('Centro');
    expect(lido.name).toBeNull();
    expect(lido.sobrou).toContain('Centro');
  });

  it('endereço não é confundido com nome, nem o contrário', () => {
    const lido = parseChatFill('Ana Beatriz Lima\nRua São José 250');
    expect(lido.name).toBe('Ana Beatriz Lima');
    expect(lido.address).toBe('Rua São José 250');
  });

  it('o que não é entendido volta para a tela', () => {
    const lido = parseChatFill('Ana Beatriz Lima, olhos azuis, gosta de futebol');
    expect(lido.name).toBe('Ana Beatriz Lima');
    expect(lido.sobrou.length).toBeGreaterThan(0);
  });

  it('mensagem vazia não inventa nada', () => {
    const lido = parseChatFill('   ');
    expect(resumoDoPreenchimento(lido)).toEqual([]);
    expect(lido.sobrou).toEqual([]);
  });

  it('CPF com cara de celular não vira telefone', () => {
    // 529.982.247-25 vira 52998224725, que tem a forma exata de um celular.
    // O que separa os dois é o DDD: 52 não existe no Brasil.
    const lido = parseChatFill('529.982.247-25');
    expect(lido.phone).toBeNull();
    expect(lido.voterId).toBeNull();
    expect(lido.sobrou).toContain('529.982.247-25');
  });

  it('rótulo escrito vale mais do que a tabela de DDD', () => {
    // Quem escreveu "telefone" disse o que era. A palavra da pessoa manda.
    expect(parseChatFill('telefone: 52998224725').phone).toBe('52998224725');
  });
});
