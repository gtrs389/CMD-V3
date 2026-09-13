'use client';

import { Check, Copy, Link2 } from 'lucide-react';
import { useGenerateLinkFlow, type GeneratedLink } from '@/hooks/use-generate-link';
import { Button } from '@/components/ui/Button';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { Modal } from '@/components/ui/Modal';

interface GenerateLinkButtonProps {
  /** Gera (ou renova) o link e devolve o endereco novo, ou null se falhar. */
  generate: () => Promise<GeneratedLink | null>;
  label?: string;
  /** Caminho do link. O padrao e o do convite de cadastro. */
  buildPath?: (token: string) => string;
  /** Texto do aviso de sucesso, quando nao e o link de cadastro. */
  successTitle?: string;
}

/**
 * Botao do link de cadastro.
 *
 * Duas etapas, na ordem em que a pessoa pensa:
 *
 *   1. clicou -> a tela inteira mostra "Gerando link", com o anel girando.
 *      Ninguem clica de novo e ninguem fica na duvida se funcionou;
 *   2. pronto -> um aviso curto confirma, e o botao copia quando ela pedir.
 *
 * O endereco NUNCA aparece na tela: ele e um segredo de uso unico e nao tem
 * por que ficar exposto em cima do painel, a vista de quem estiver por
 * perto. Ele vai direto para a area de transferencia.
 *
 * Serve tanto para o link do time inteiro (ADMIN) quanto para o link pessoal
 * (time e equipe): quem chama decide a geracao, este componente cuida da
 * apresentacao.
 */
export function GenerateLinkButton({
  generate,
  label = 'Gerar Link',
  buildPath,
  successTitle = 'Link gerado com sucesso',
}: GenerateLinkButtonProps) {
  const { phase, generating, copied, handleGenerate, handleCopy, close } =
    useGenerateLinkFlow(generate, buildPath);

  return (
    <>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={phase !== 'idle'}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill bg-accent-600 px-4 text-sm font-medium whitespace-nowrap text-white shadow-card transition-colors hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Link2 aria-hidden="true" className="size-4" />
        {label}
      </button>

      <LoadingOverlay open={generating} title="Gerando link" icon={<Link2 className="size-6" />} />

      <Modal
        open={phase === 'ready'}
        onClose={close}
        chrome="plain"
        title={successTitle}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={close} fullWidth>
              Fechar
            </Button>
            <Button onClick={handleCopy} fullWidth>
              {copied ? (
                <Check aria-hidden="true" className="size-4" />
              ) : (
                <Copy aria-hidden="true" className="size-4" />
              )}
              {copied ? 'Link copiado' : 'Copiar link'}
            </Button>
          </>
        }
      >
        {/* Um aviso so. A altura fica reservada para a confirmacao aparecer
            sem empurrar os botoes. */}
        <p
          aria-live="polite"
          className="min-h-5 text-center text-sm font-semibold text-success-600"
        >
          {copied ? 'Link copiado. É só colar e enviar.' : ''}
        </p>
      </Modal>
    </>
  );
}
