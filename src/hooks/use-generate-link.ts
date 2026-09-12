'use client';

import { useState } from 'react';
import { copyText } from '@/lib/utils/clipboard';
import { invitePath } from '@/lib/utils/url';
import { useToast } from '@/components/ui/Toast';

/**
 * Fluxo do botao "Link de cadastro", em duas etapas claras.
 *
 *   1. `generating` — o aviso central diz que o link esta sendo gerado.
 *      Ninguem clica duas vezes, porque a tela inteira fica ocupada.
 *   2. `ready`      — o link aparece pronto, com o botao de copiar.
 *
 * A copia NAO acontece sozinha. Antes ela era automatica e a pessoa nunca
 * sabia se tinha dado certo: agora quem copia e ela, no proprio botao, e a
 * confirmacao aparece ali mesmo.
 *
 * O aviso de "gerando" fica no ar por um instante minimo. Sem isso, uma
 * resposta rapida do servidor faria um piscar que parece defeito.
 */

/** Tempo minimo do aviso central, para ele nao piscar. */
const MIN_GENERATING_MS = 700;

export type GenerateLinkPhase = 'idle' | 'generating' | 'ready';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Caminho do link a partir do token.
 *
 * O padrao e o do convite de cadastro. O questionario passa o seu, porque e
 * OUTRO link, para outra tela: quem o responde nao vira integrante.
 */
export function useGenerateLinkFlow(
  generate: () => Promise<string | null>,
  buildPath: (token: string) => string = invitePath,
) {
  const toast = useToast();
  const [phase, setPhase] = useState<GenerateLinkPhase>('idle');
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    if (phase !== 'idle') return;

    setCopied(false);
    setUrl(null);
    setPhase('generating');

    const inicio = Date.now();
    try {
      const token = await generate();
      await wait(Math.max(0, MIN_GENERATING_MS - (Date.now() - inicio)));

      if (!token) {
        toast.error('Não foi possível gerar o link. Tente novamente.');
        setPhase('idle');
        return;
      }

      setUrl(`${window.location.origin}${buildPath(token)}`);
      setPhase('ready');
    } catch (error) {
      // Sem este `catch` a recusa do servidor virava rejeicao nao tratada: o
      // botao voltava ao normal e a tela nao dizia absolutamente nada. A
      // mensagem do servidor ja e escrita para ser lida por quem clicou.
      await wait(Math.max(0, MIN_GENERATING_MS - (Date.now() - inicio)));
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível gerar o link. Tente novamente.',
      );
      setPhase('idle');
    }
  }

  async function handleCopy() {
    if (!url) return;
    if (!(await copyText(url))) {
      toast.error('Não foi possível copiar. Selecione o endereço e copie manualmente.');
      return;
    }
    setCopied(true);
  }

  function close() {
    setPhase('idle');
    setUrl(null);
    setCopied(false);
  }

  return {
    phase,
    generating: phase === 'generating',
    url,
    copied,
    handleGenerate,
    handleCopy,
    close,
  };
}
