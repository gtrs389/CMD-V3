'use client';

import { useEffect, useState } from 'react';
import { ehAtalhoDeInspecao, pareceFerramentasAbertas } from '@/lib/domain/access-shield';
import { BlockedScreen } from './BlockedScreen';

/**
 * Tranca da tela: botao direito, F12 e os atalhos de inspecionar.
 *
 * O QUE ISTO E, E O QUE NAO E. E dissuasao, nao seguranca. Todo o codigo do
 * navegador ja esta na maquina de quem abriu a pagina, e ninguem precisa do
 * F12 para le-lo: basta abrir as ferramentas ANTES de carregar, desligar o
 * JavaScript, pedir o endereco por `curl` ou olhar o trafego por um proxy —
 * e nenhum desses caminhos passa por aqui. Quem barra de verdade e o
 * servidor, e e la que este projeto ja se defende: a chave do banco nunca
 * entra no pacote do navegador, as tabelas tem RLS, e cada sessao e
 * conferida contra `cmd_sessions` a cada requisicao. Esta tela desencoraja o
 * curioso; ela nao segura quem sabe o que esta fazendo, e tratar isso como
 * protecao seria o erro caro.
 *
 * DUAS TRANCAS, COM COMPORTAMENTOS DIFERENTES DE PROPOSITO:
 *
 *   1. ATO DELIBERADO — apertar F12, Ctrl+Shift+I/J/C, Ctrl+U, ou o botao
 *      direito. Ninguem faz isso por acidente, entao a tela FICA. Sai
 *      recarregando a pagina: nada e gravado, e ninguem fica trancado para
 *      sempre por causa de um toque;
 *   2. FERRAMENTAS ABERTAS — medido pelo pedaco de janela que some quando o
 *      painel abre encostado. Esse sinal ERRA: encaixar a janela, mudar o
 *      zoom, uma barra lateral do navegador. Por isso ele e REVERSIVEL — a
 *      tela sai sozinha quando o espaco volta — e o limite e alto (220px),
 *      bem acima de qualquer barra. Um engano aqui custaria o cadastro de
 *      uma pessoa no meio do preenchimento, e esse preco e mais alto que o
 *      do curioso que passou.
 *
 * O QUE NAO E BLOQUEADO, e por que: copiar e colar (Ctrl+C / Ctrl+V) ficam,
 * porque colar o telefone e o e-mail e metade do cadastro; e o botao direito
 * continua valendo DENTRO dos campos de texto, onde ele e colar, corretor e
 * tradutor. Quem preenche o formulario nao pode pagar por uma tranca que
 * existe para outra pessoa.
 *
 * Nada aqui desmonta a pagina: a tela e desenhada POR CIMA. Um engano nao
 * apaga o que a pessoa ja digitou.
 */

/** O alvo do clique e um campo onde a pessoa escreve? */
function ehCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  if (alvo.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName);
}

export function AccessShield() {
  const [bloqueado, setBloqueado] = useState(false);
  /** Ligado por ato deliberado: nao sai sozinho. */
  const [travado, setTravado] = useState(false);

  useEffect(() => {
    function aoTeclar(event: KeyboardEvent) {
      if (!ehAtalhoDeInspecao(event)) return;
      event.preventDefault();
      setTravado(true);
      setBloqueado(true);
    }

    function aoClicarComDireito(event: MouseEvent) {
      // Dentro de um campo de texto o botao direito e colar, corretor e
      // tradutor. Ele fica.
      if (ehCampoDeTexto(event.target)) return;
      event.preventDefault();
      setTravado(true);
      setBloqueado(true);
    }

    function conferirPainel() {
      // Fora do navegador (previa, teste) nao ha o que medir.
      if (typeof window.outerWidth !== 'number') return;

      const aberto = pareceFerramentasAbertas(window);

      // So o sinal reversivel e desligado aqui: um ato deliberado nao e
      // desfeito por redimensionar a janela.
      setBloqueado((atual) => (travado ? atual : aberto));
    }

    window.addEventListener('keydown', aoTeclar);
    window.addEventListener('contextmenu', aoClicarComDireito);
    window.addEventListener('resize', conferirPainel);
    const relogio = window.setInterval(conferirPainel, 1000);
    conferirPainel();

    return () => {
      window.removeEventListener('keydown', aoTeclar);
      window.removeEventListener('contextmenu', aoClicarComDireito);
      window.removeEventListener('resize', conferirPainel);
      window.clearInterval(relogio);
    };
  }, [travado]);

  if (!bloqueado) return null;
  return <BlockedScreen />;
}
