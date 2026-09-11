'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyText } from '@/lib/utils/clipboard';
import { teamAccessPath } from '@/lib/utils/url';
import { useOrigin } from '@/hooks/use-origin';
import { useToast } from '@/components/ui/Toast';

/**
 * Endereco de acesso ao sistema pelo link do time, com a acao de copiar.
 *
 * Copiar nunca gera um link novo: o endereco exibido e sempre o que ja esta
 * valendo. So o ADMIN geral chega ate aqui.
 */
export function TeamAccessLinkField({ token, label }: { token: string; label: string }) {
  const toast = useToast();
  const origin = useOrigin();
  const [copied, setCopied] = useState(false);

  const path = teamAccessPath(token);
  const url = origin ? `${origin}${path}` : path;

  async function handleCopy() {
    const ok = await copyText(url);
    if (!ok) {
      toast.error('Não foi possível copiar. Selecione o texto manualmente.');
      return;
    }
    setCopied(true);
    toast.success('Link copiado.');
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-1 rounded-control border border-line bg-ink-50 pr-1 pl-3">
        <input
          readOnly
          value={url}
          aria-label={label}
          onFocus={(event) => event.currentTarget.select()}
          className="min-h-11 w-full min-w-0 bg-transparent font-mono text-xs text-ink-700 focus:outline-none"
        />
      </div>

      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-control bg-accent-600 px-4 text-sm font-medium text-white transition-colors hover:bg-accent-700"
      >
        {copied ? (
          <Check aria-hidden="true" className="size-4" />
        ) : (
          <Copy aria-hidden="true" className="size-4" />
        )}
        Copiar link de acesso
      </button>
    </div>
  );
}
