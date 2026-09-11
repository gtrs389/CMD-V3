'use client';

import { useState } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import type { PersonalInvite } from '@/lib/types';
import { copyText } from '@/lib/utils/clipboard';
import { invitePath } from '@/lib/utils/url';
import { useOrigin } from '@/hooks/use-origin';
import { useToast } from '@/components/ui/Toast';

/**
 * Link pessoal de recrutamento.
 *
 * O integrante copia e compartilha o proprio link, e so ele. Nao ativa,
 * desativa, renova nem edita o formulario: as rotas correspondentes recusam
 * o perfil no servidor, nao apenas aqui.
 *
 * O endereco vem do banco a cada carregamento, entao continua o mesmo depois
 * de sair, entrar de novo, trocar de aparelho ou recarregar. Abrir esta tela
 * nao gera, renova nem invalida token.
 */
export function PersonalLinkCard({ invite }: { invite: PersonalInvite }) {
  const toast = useToast();
  const origin = useOrigin();
  const [copied, setCopied] = useState(false);

  const path = invite.token ? invitePath(invite.token) : null;
  const url = path ? (origin ? `${origin}${path}` : path) : '';
  const ativo = invite.active && invite.operationActive;

  async function handleCopy() {
    if (!url) return;
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
    <section
      aria-labelledby="meu-link"
      className="rounded-card border border-line bg-surface p-3.5 shadow-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-control bg-accent-50 text-accent-600"
        >
          <Link2 className="size-[1.125rem]" />
        </span>
        <h2 id="meu-link" className="text-[0.8125rem] font-semibold text-ink-900">
          Meu link de cadastro
        </h2>
        <span
          className={
            ativo
              ? 'inline-flex items-center gap-1.5 rounded-pill bg-success-50 px-2 py-1 text-[0.6875rem] font-medium text-success-600'
              : 'inline-flex items-center gap-1.5 rounded-pill bg-danger-50 px-2 py-1 text-[0.6875rem] font-medium text-danger-600'
          }
        >
          <span
            aria-hidden="true"
            className={
              ativo ? 'size-1.5 rounded-full bg-success-600' : 'size-1.5 rounded-full bg-danger-600'
            }
          />
          {ativo ? 'Ativo' : 'Inativo'}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        {path ? (
          <div className="flex min-w-0 flex-1 items-center gap-1 rounded-control border border-line bg-ink-50 pr-1 pl-3">
            <input
              readOnly
              value={url}
              aria-label="Meu link de cadastro"
              onFocus={(event) => event.currentTarget.select()}
              className="min-h-11 w-full min-w-0 bg-transparent font-mono text-xs text-ink-700 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copiar meu link de cadastro"
              className="flex size-11 shrink-0 items-center justify-center rounded-control text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              {copied ? (
                <Check aria-hidden="true" className="size-4 text-success-600" />
              ) : (
                <Copy aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>
        ) : (
          <p className="flex min-h-11 min-w-0 flex-1 items-center rounded-control border border-line bg-ink-50 px-3 text-xs text-ink-500">
            Link ainda não disponível. Peça ao responsável pela sua candidatura.
          </p>
        )}
      </div>

      <p className="mt-2 text-[0.6875rem] text-ink-500">
        {ativo
          ? 'Quem se cadastrar por este link aparece na sua equipe.'
          : 'O recrutamento desta candidatura está desativado: o link não aceita cadastros agora.'}
      </p>
    </section>
  );
}
