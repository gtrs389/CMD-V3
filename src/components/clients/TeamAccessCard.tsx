'use client';

import { useCallback, useState } from 'react';
import { KeyRound, RefreshCw } from 'lucide-react';
import type { TeamAccessLink } from '@/lib/types';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { TeamAccessLinkField } from './TeamAccessLinkField';

/**
 * Acesso ao sistema pelo link do time. Exclusivo do ADMIN geral.
 *
 * O MESMO link vale para todas as pessoas ativas daquele time —
 * Administradores do time e membros da equipe: cada uma entra com o proprio
 * telefone e abre a propria sessao, com o proprio escopo. Ele nao expira
 * sozinho e nao e consumido — vale ate ser renovado aqui.
 *
 * Este nao e o link de recrutamento, que e de uso unico e tem prazo.
 *
 * Copiar nunca gera um endereco novo. Gerar um novo invalida o anterior na
 * hora e derruba as sessoes abertas do time inteiro; os aparelhos ja
 * autorizados continuam valendo.
 */
export function TeamAccessCard({ clientId }: { clientId: string }) {
  const toast = useToast();
  const loader = useCallback(
    () => api<{ accessLink: TeamAccessLink }>(`/api/clients/${clientId}/acesso`),
    [clientId],
  );
  const { data, loading, error, reload } = useRepositoryQuery(loader);

  const [confirming, setConfirming] = useState(false);
  const [rotating, setRotating] = useState(false);

  const link = data?.accessLink ?? null;

  async function rotate() {
    setRotating(true);
    try {
      await api<{ accessLink: TeamAccessLink }>(`/api/clients/${clientId}/acesso`, {
        method: 'POST',
      });
      toast.success('Novo link gerado. O anterior deixou de funcionar.');
      reload();
    } catch {
      toast.error('Não foi possível gerar um novo link.');
    } finally {
      setRotating(false);
    }
  }

  return (
    <section
      aria-labelledby="acesso-dos-administradores"
      className="flex flex-col rounded-card border border-line bg-surface shadow-card"
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <h2
          id="acesso-dos-administradores"
          className="flex items-center gap-2 text-[0.8125rem] font-semibold text-ink-900"
        >
          <KeyRound aria-hidden="true" className="size-4 text-accent-600" />
          Acesso ao sistema
        </h2>

        {link ? (
          <span
            className={
              link.active
                ? 'inline-flex items-center gap-1.5 rounded-pill bg-success-50 px-2 py-1 text-[0.6875rem] font-medium text-success-600'
                : 'inline-flex items-center gap-1.5 rounded-pill bg-danger-50 px-2 py-1 text-[0.6875rem] font-medium text-danger-600'
            }
          >
            <span
              aria-hidden="true"
              className={
                link.active ? 'size-1.5 rounded-full bg-success-600' : 'size-1.5 rounded-full bg-danger-600'
              }
            />
            {link.active ? 'Ativo' : 'Revogado'}
          </span>
        ) : null}
      </div>

      <div className="space-y-3 px-4 pb-4">
        {loading ? (
          <Skeleton className="h-11 rounded-control" />
        ) : error || !link ? (
          <div role="alert" className="space-y-2">
            <p className="text-sm text-ink-500">Não foi possível carregar o link de acesso.</p>
            <Button variant="secondary" size="sm" onClick={reload}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <>
            <TeamAccessLinkField token={link.token} label="Link de acesso ao sistema" />

            <p className="text-[0.6875rem] text-ink-500">
              Envie este link aos administradores e membros do time.
            </p>

            <Button
              variant="secondary"
              size="sm"
              loading={rotating}
              onClick={() => setConfirming(true)}
            >
              {!rotating ? <RefreshCw aria-hidden="true" className="size-4" /> : null}
              Gerar novo link
            </Button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title="Gerar novo link de acesso"
        description="O link atual deixará de funcionar e todas as pessoas deste time — administradores e membros — serão desconectadas."
        confirmLabel="Gerar novo link"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void rotate();
        }}
      />
    </section>
  );
}
