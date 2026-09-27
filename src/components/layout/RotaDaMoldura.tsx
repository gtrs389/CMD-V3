'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { CHAVE_DA_ROTA, ehRotaDaMoldura } from '@/lib/domain/endereco-limpo';

/**
 * Dentro da moldura (ver `endereco-limpo.ts`): anota a tela aberta, para
 * recarregar a pagina voltar a ela, e leva o titulo da tela para a aba do
 * navegador — que e a da pagina de fora.
 */
export function RotaDaMoldura() {
  const caminho = usePathname();
  const busca = useSearchParams();

  // O script do `<head>` so roda quando a pagina carrega inteira. Uma
  // navegacao DENTRO do app (o login do time levando ao painel, um link
  // para a raiz) nao passa por ele — e aqui que ela e endireitada.
  useEffect(() => {
    const consulta = busca.toString();
    const destino = consulta ? `${caminho}?${consulta}` : caminho;
    const dentro = window.self !== window.top;
    const doPainel = ehRotaDaMoldura(caminho);

    try {
      if (doPainel) window.sessionStorage.setItem(CHAVE_DA_ROTA, destino);
    } catch {
      // Sem armazenamento: recarregar volta para a pagina inicial.
      if (!dentro) return;
    }

    // Tela do painel aberta direto na janela: vai para a moldura.
    if (!dentro && doPainel) window.location.replace('/');
    // Pagina que nao e do painel dentro da moldura: ocupa a janela inteira.
    else if (dentro && !doPainel) window.top!.location.replace(caminho === '/' ? '/' : destino);
  }, [caminho, busca]);

  // O titulo muda depois da navegacao (metadados chegam em seguida): o
  // observador acompanha a tag, e nao so a troca de rota.
  useEffect(() => {
    if (window.self === window.top) return;
    let externo: Document;
    try {
      externo = window.top!.document;
    } catch {
      return;
    }
    const copiar = () => {
      if (document.title) externo.title = document.title;
    };
    copiar();
    const observador = new MutationObserver(copiar);
    observador.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observador.disconnect();
  }, []);

  return null;
}
