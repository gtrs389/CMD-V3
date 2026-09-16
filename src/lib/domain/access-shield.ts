/**
 * Quais teclas abrem as ferramentas do navegador ou o codigo-fonte.
 *
 * Modulo PURO, separado do componente de proposito: e uma lista de teclas, e
 * o que ela NAO pega importa tanto quanto o que pega. Aqui isso fica
 * testavel sem montar tela nenhuma.
 *
 * Copiar, colar, recortar, selecionar tudo e desfazer (Ctrl+C, V, X, A, Z)
 * ficam de fora, e nao por esquecimento: colar o telefone e o e-mail e
 * metade do cadastro de quem recebe o link. Uma tranca que existe para o
 * curioso nao pode ser paga por quem esta se cadastrando.
 */

/** So o que interessa de um evento de teclado. */
export interface AtalhoTeclado {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export function ehAtalhoDeInspecao(event: AtalhoTeclado): boolean {
  if (event.key === 'F12') return true;

  // `Cmd` no Mac, `Ctrl` no resto.
  const comando = event.ctrlKey || event.metaKey;
  if (!comando) return false;

  const tecla = event.key.toLowerCase();

  // Ctrl+U / Cmd+U: o codigo-fonte da pagina.
  if (tecla === 'u' && !event.shiftKey && !event.altKey) return true;

  // Ctrl+Shift+I/J/C e Ctrl+Shift+K (console do Firefox). No Mac o mesmo
  // conjunto usa Alt no lugar do Shift.
  if ((event.shiftKey || event.altKey) && ['i', 'j', 'c', 'k'].includes(tecla)) return true;

  return false;
}

/** Sobra de janela que denuncia o painel das ferramentas aberto encostado. */
export const LIMITE_PAINEL = 220;

/**
 * As ferramentas parecem abertas, pelo tamanho da janela?
 *
 * Este sinal ERRA: encaixar a janela, mudar o zoom ou abrir uma barra
 * lateral do navegador mexem nas mesmas medidas. Por isso o limite e alto e,
 * no componente, o bloqueio que ele liga e REVERSIVEL — sai sozinho quando o
 * espaco volta. Um engano aqui custaria o cadastro de uma pessoa no meio do
 * preenchimento.
 */
export function pareceFerramentasAbertas(janela: {
  outerWidth: number;
  innerWidth: number;
  outerHeight: number;
  innerHeight: number;
}): boolean {
  return (
    janela.outerWidth - janela.innerWidth > LIMITE_PAINEL ||
    janela.outerHeight - janela.innerHeight > LIMITE_PAINEL
  );
}
