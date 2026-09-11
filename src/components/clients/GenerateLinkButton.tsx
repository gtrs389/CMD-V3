'use client';

import { Check, Copy, Link2 } from 'lucide-react';
import { useGenerateLinkFlow } from '@/hooks/use-generate-link';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface GenerateLinkButtonProps {
  /** Gera (ou renova) o link e devolve o token novo, ou null se falhar. */
  generate: () => Promise<string | null>;
  label?: string;
}

/**
 * Botao "Gerar Link".
 *
 * Um clique gera o link e ja copia o endereco para a area de transferencia:
 * a pessoa nunca ve a tela do link nem o endereco em si, so um aviso
 * central confirmando o sucesso, com um botao para copiar de novo caso a
 * copia automatica nao tenha funcionado. Serve tanto para o link pessoal
 * (time e equipe) quanto para o link do time inteiro (ADMIN): quem chama
 * decide a geracao, este componente cuida so da copia e do aviso.
 */
export function GenerateLinkButton({ generate, label = 'Gerar Link' }: GenerateLinkButtonProps) {
  const { generating, pendingUrl, copied, handleGenerate, handleCopyAgain, close } =
    useGenerateLinkFlow(generate);

  return (
    <>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={generating}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill bg-accent-600 px-4 text-sm font-medium text-white shadow-card transition-colors hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Link2 aria-hidden="true" className="size-4" />
        {generating ? 'Gerando...' : label}
      </button>

      <Modal
        open={pendingUrl !== null}
        onClose={close}
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
