import { describe, expect, it } from 'vitest';
import {
  ehAtalhoDeInspecao,
  pareceFerramentasAbertas,
  LIMITE_PAINEL,
} from '@/lib/domain/access-shield';

/**
 * A tranca de tela e dissuasao, nao seguranca — o codigo do navegador ja
 * esta na maquina de quem abriu a pagina. O que estes testes protegem e o
 * outro lado: que a tranca nao caia sobre quem esta so se cadastrando.
 */

describe('atalhos de inspecao', () => {
  it('pega o que abre ferramentas ou codigo-fonte', () => {
    expect(ehAtalhoDeInspecao({ key: 'F12' })).toBe(true);
    expect(ehAtalhoDeInspecao({ key: 'I', ctrlKey: true, shiftKey: true })).toBe(true);
    expect(ehAtalhoDeInspecao({ key: 'j', ctrlKey: true, shiftKey: true })).toBe(true);
    expect(ehAtalhoDeInspecao({ key: 'k', ctrlKey: true, shiftKey: true })).toBe(true);
    // Mac: Cmd+Alt no lugar de Ctrl+Shift.
    expect(ehAtalhoDeInspecao({ key: 'C', metaKey: true, altKey: true })).toBe(true);
    expect(ehAtalhoDeInspecao({ key: 'u', ctrlKey: true })).toBe(true);
    expect(ehAtalhoDeInspecao({ key: 'U', metaKey: true })).toBe(true);
  });

  it('NAO pega copiar, colar e o resto do cadastro', () => {
    // Colar o telefone e o e-mail e metade do cadastro de quem recebe o
    // link: bloquear isto seria cobrar do eleitor uma tranca que existe para
    // outra pessoa.
    for (const tecla of ['c', 'v', 'x', 'a', 'z', 'y', 'r', 'f', 's', 'p']) {
      expect(ehAtalhoDeInspecao({ key: tecla, ctrlKey: true })).toBe(false);
    }
    expect(ehAtalhoDeInspecao({ key: 'i' })).toBe(false);
    expect(ehAtalhoDeInspecao({ key: 'Tab' })).toBe(false);
    expect(ehAtalhoDeInspecao({ key: 'Enter' })).toBe(false);
    expect(ehAtalhoDeInspecao({ key: 'F5' })).toBe(false);
  });
});

describe('ferramentas abertas pelo tamanho da janela', () => {
  const celular = { outerWidth: 390, innerWidth: 390, outerHeight: 780, innerHeight: 664 };

  it('celular comum nao dispara', () => {
    // A barra do navegador come altura em TODO celular. Se isso bastasse,
    // ninguem conseguiria se cadastrar.
    expect(pareceFerramentasAbertas(celular)).toBe(false);
  });

  it('janela comum de computador nao dispara', () => {
    expect(
      pareceFerramentasAbertas({
        outerWidth: 1512,
        innerWidth: 1512,
        outerHeight: 945,
        innerHeight: 860,
      }),
    ).toBe(false);
  });

  it('barra lateral do navegador nao dispara', () => {
    // Uma barra lateral tira uns 300px? Nao: tira bem menos que o limite, e
    // o limite e alto justamente para caber esse tipo de coisa.
    expect(
      pareceFerramentasAbertas({
        outerWidth: 1512,
        innerWidth: 1512 - (LIMITE_PAINEL - 20),
        outerHeight: 945,
        innerHeight: 945,
      }),
    ).toBe(false);
  });

  it('painel encostado ao lado ou embaixo dispara', () => {
    expect(
      pareceFerramentasAbertas({
        outerWidth: 1512,
        innerWidth: 1000,
        outerHeight: 945,
        innerHeight: 945,
      }),
    ).toBe(true);
    expect(
      pareceFerramentasAbertas({
        outerWidth: 1512,
        innerWidth: 1512,
        outerHeight: 945,
        innerHeight: 500,
      }),
    ).toBe(true);
  });
});
