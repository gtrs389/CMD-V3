'use client';

import { useEffect, useRef } from 'react';
import { CHAVE_DA_ROTA, rotaGuardada } from '@/lib/domain/endereco-limpo';

/**
 * A moldura do painel, no endereco raiz: a barra do navegador mostra so o
 * dominio, e o painel roda aqui dentro (ver `endereco-limpo.ts`).
 *
 * Abre a tela anotada — o link colado, a tela de antes de recarregar — ou,
 * sem nenhuma, a pagina inicial do perfil, que o servidor ja decidiu.
 */
export function MolduraDoPainel({ inicio }: { inicio: string }) {
  const moldura = useRef<HTMLIFrameElement>(null);

  // O endereco da moldura e escrito direto no elemento, depois de montar: o
  // caminho anotado so existe no navegador, e o servidor nao o conhece.
  useEffect(() => {
    let anotada: string | null = null;
    try {
      anotada = rotaGuardada(window.sessionStorage.getItem(CHAVE_DA_ROTA));
    } catch {
      anotada = null;
    }
    if (moldura.current) moldura.current.src = anotada ?? inicio;
  }, [inicio]);

  /**
   * A moldura foi parar fora do site (a saida configurada pelo ADMIN, uma
   * sessao vencida no painel do time): a janela inteira vai junto, e a raiz
   * decide o que mostrar. Um site de fora dentro da moldura ficaria em
   * branco — a maioria recusa ser emoldurada.
   */
  function aoCarregar() {
    const janela = moldura.current?.contentWindow;
    if (!janela) return;
    try {
      void janela.location.href;
      if (janela.location.href === 'about:blank') return;
      document.title = janela.document.title || document.title;
    } catch {
      window.location.replace('/');
    }
  }

  return (
    <iframe
      ref={moldura}
      title="Painel"
      onLoad={aoCarregar}
      allow="clipboard-read; clipboard-write; fullscreen; geolocation; web-share"
      allowFullScreen
      className="fixed inset-0 h-dvh w-full border-0 bg-surface"
    />
  );
}
