'use client';

import { useState } from 'react';
import { copyText } from '@/lib/utils/clipboard';
import { invitePath } from '@/lib/utils/url';
import { useToast } from '@/components/ui/Toast';

/**
 * Fluxo comum a qualquer botao "Gerar Link": chama a geracao (pessoal ou do
 * time), copia o endereco resultante sem exibi-lo e guarda o estado do aviso
 * de sucesso central, com o botao "Copiar" de reforco.
 */
export function useGenerateLinkFlow(generate: () => Promise<string | null>) {
  const toast = useToast();
  const [generating, setGenerating] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const token = await generate();
      if (!token) {
        toast.error('Não foi possível gerar o link. Tente novamente.');
        return;
      }

      const url = `${window.location.origin}${invitePath(token)}`;
      const ok = await copyText(url);
      setCopied(ok);
      setPendingUrl(url);
    } catch (error) {
      // Sem este `catch` a recusa do servidor virava rejeicao nao tratada: o
      // botao voltava ao normal e a tela nao dizia absolutamente nada. A
      // mensagem do servidor ja e escrita para ser lida por quem clicou.
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível gerar o link. Tente novamente.',
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopyAgain() {
    if (!pendingUrl) return;
    const ok = await copyText(pendingUrl);
    setCopied(ok);
    if (!ok) toast.error('Não foi possível copiar. Tente novamente.');
  }

  return {
    generating,
    pendingUrl,
    copied,
    handleGenerate,
    handleCopyAgain,
    close: () => setPendingUrl(null),
  };
}
