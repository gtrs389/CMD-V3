'use client';

import { useState } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import { copyText } from '@/lib/utils/clipboard';
import { invitePath } from '@/lib/utils/url';
import { useOwnInviteRenewal } from '@/hooks/use-own-invite';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

/**
 * Botao "Gerar Link".
 *
 * Um clique gera o proprio link de recrutamento e ja copia o endereco para
 * a area de transferencia: a pessoa nunca ve a tela com o link nem o
 * endereco em si, so um aviso central confirmando o sucesso, com um botao
 * para copiar de novo caso a copia automatica nao tenha funcionado.
 */
export function GenerateInviteButton() {
  const { renew, renewing } = useOwnInviteRenewal();
  const toast = useToast();
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    const issued = await renew();
    if (!issued) {
      toast.error('Não foi possível gerar o link. Tente novamente.');
      return;
    }

    const url = `${window.location.origin}${invitePath(issued.token)}`;
    const ok = await copyText(url);
    setCopied(ok);
    setPendingUrl(url);
  }

  async function handleCopyAgain() {
    if (!pendingUrl) return;
    const ok = await copyText(pendingUrl);
    setCopied(ok);
    if (!ok) toast.error('Não foi possível copiar. Tente novamente.');
  }

  return (
    <>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={renewing}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill bg-accent-600 px-4 text-sm font-medium text-white shadow-card transition-colors hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Link2 aria-hidden="true" className="size-4" />
        {renewing ? 'Gerando...' : 'Gerar Link'}
      </button>

      <Modal
        open={pendingUrl !== null}
        onClose={() => setPendingUrl(null)}
        title="Link gerado com sucesso"
        size="sm"
        footer={
          <Button variant="secondary" onClick={handleCopyAgain} fullWidth>
            {copied ? (
              <Check aria-hidden="true" className="size-4 text-success-600" />
            ) : (
              <Copy aria-hidden="true" className="size-4" />
            )}
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
        }
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full bg-success-50 text-success-600"
          >
            <Check className="size-6" />
          </span>
          <p className="text-sm text-ink-700">
            {copied
              ? 'O link já foi copiado para a área de transferência. É só colar e enviar para a pessoa que você quer cadastrar.'
              : 'O link foi gerado. Toque em "Copiar" e cole onde quiser enviar para a pessoa que você quer cadastrar.'}
          </p>
        </div>
      </Modal>
    </>
  );
}
