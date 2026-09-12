'use client';

import { Check, Copy, Link2, Sparkles } from 'lucide-react';
import { useGenerateLinkFlow } from '@/hooks/use-generate-link';
import { Button } from '@/components/ui/Button';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { Modal } from '@/components/ui/Modal';

interface GenerateLinkButtonProps {
  /** Gera (ou renova) o link e devolve o token novo, ou null se falhar. */
  generate: () => Promise<string | null>;
  label?: string;
}

/**
 * Botao do link de cadastro.
 *
 * Duas etapas, na ordem em que a pessoa pensa:
 *
 *   1. clicou -> a tela inteira mostra "Gerando link", com o anel girando.
 *      Ninguem clica de novo e ninguem fica na duvida se funcionou;
 *   2. pronto -> o endereco aparece por extenso, com um botao grande para
 *      copiar. A copia so acontece quando a pessoa pede.
 *
 * O endereco fica visivel de proposito: se a copia falhar — navegador
 * antigo, permissao negada, area de transferencia bloqueada — ela ainda
 * consegue selecionar e copiar na mao.
 *
 * Serve tanto para o link do time inteiro (ADMIN) quanto para o link pessoal
 * (time e equipe): quem chama decide a geracao, este componente cuida da
 * apresentacao.
 */
export function GenerateLinkButton({
  generate,
  label = 'Gerar Link',
}: GenerateLinkButtonProps) {
  const { phase, generating, url, copied, handleGenerate, handleCopy, close } =
    useGenerateLinkFlow(generate);

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

      <LoadingOverlay
        open={generating}
        title="Gerando link"
        description="Criando um endereço novo e exclusivo para este cadastro."
        icon={<Link2 className="size-6" />}
      />

      <Modal
        open={phase === 'ready'}
        onClose={close}
        chrome="plain"
        title="Link pronto para enviar"
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
        <div className="flex flex-col items-center gap-5 text-center">
          <span
            aria-hidden="true"
            className="flex size-14 animate-pop items-center justify-center rounded-full bg-success-50 text-success-600"
          >
            <Sparkles className="size-7" />
          </span>

          <p className="text-sm text-balance text-ink-700">
            Toque em <span className="font-semibold text-ink-900">Copiar link</span> e envie para a
            pessoa que você quer cadastrar. Ele vale para uma pessoa só.
          </p>

          {/* O endereco por extenso: se a copia falhar, da para selecionar
              e copiar na mao. */}
          <div className="w-full rounded-control border border-line bg-ink-50 px-3 py-2.5 text-left">
            <p className="text-[0.6875rem] font-semibold tracking-wide text-ink-500 uppercase">
              Endereço do cadastro
            </p>
            <input
              readOnly
              value={url ?? ''}
              aria-label="Endereço do link de cadastro"
              onFocus={(event) => event.currentTarget.select()}
              className="mt-1 w-full bg-transparent font-mono text-xs break-all text-ink-900 focus:outline-none"
            />
          </div>

          {/* Altura reservada: a confirmacao aparece sem empurrar o dialogo. */}
          <p aria-live="polite" className="min-h-4 text-xs font-semibold text-success-600">
            {copied ? 'Copiado! É só colar e enviar.' : ''}
          </p>
        </div>
      </Modal>
    </>
  );
}
