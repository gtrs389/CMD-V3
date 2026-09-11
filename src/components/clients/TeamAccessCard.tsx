'use client';

import { useCallback, useState } from 'react';
import { KeyRound, RefreshCw } from 'lucide-react';
import type { TeamAccessAudience, TeamAccessLink, TeamAccessLinks } from '@/lib/types';
import { TEAM_ACCESS_AUDIENCE_LABELS } from '@/lib/types';
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
 * Sao DOIS enderecos, um por publico, e cada um aceita somente os telefones
 * do seu publico: o link dos Administradores nao deixa um membro entrar, e o
 * da equipe nao deixa um administrador entrar. Cada pessoa entra com o
 * proprio telefone e abre a propria sessao, com o proprio escopo.
 *
 * Nenhum dos dois expira sozinho nem e consumido — nada a ver com o link de
 * recrutamento, que e de uso unico e tem prazo.
 *
 * Copiar nunca gera um endereco novo. Gerar um novo invalida o anterior
 * daquele publico na hora e desconecta so as pessoas dele; os aparelhos ja
 * autorizados continuam valendo.
 */

/** Texto de apoio de cada endereco. */
const HINTS: Record<TeamAccessAudience, string> = {
  TEAM_ADMIN: 'Envie este link aos administradores do time.',
  EQUIPE: 'Envie este link aos membros da equipe.',
};

export function TeamAccessCard({ clientId }: { clientId: string }) {
  const toast = useToast();
  const loader = useCallback(
    () => api<{ accessLinks: TeamAccessLinks }>(`/api/clients/${clientId}/acesso`),
    [clientId],
  );
  const { data, loading, error, reload } = useRepositoryQuery(loader);

  const [confirming, setConfirming] = useState<TeamAccessAudience | null>(null);
  const [rotating, setRotating] = useState<TeamAccessAudience | null>(null);

  const links = data?.accessLinks ?? null;

  async function rotate(audience: TeamAccessAudience) {
    setRotating(audience);
    try {
      await api<{ accessLink: TeamAccessLink }>(`/api/clients/${clientId}/acesso`, {
        method: 'POST',
        body: { audience },
      });
      toast.success('Novo link gerado. O anterior deixou de funcionar.');
      reload();
    } catch (failure) {
      toast.error(
        failure instanceof Error && failure.message
          ? failure.message
          : 'Não foi possível gerar um novo link.',
      );
    } finally {
      setRotating(null);
    }
  }

  return (
    <section
      aria-labelledby="acesso-ao-sistema"
      className="flex flex-col rounded-card border border-line bg-surface shadow-card"
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <h2
          id="acesso-ao-sistema"
          className="flex items-center gap-2 text-[0.8125rem] font-semibold text-ink-900"
        >
          <KeyRound aria-hidden="true" className="size-4 text-accent-600" />
          Acesso ao sistema
        </h2>
      </div>

      <div className="space-y-4 px-4 pb-4">
        {loading ? (
          <>
            <Skeleton className="h-11 rounded-control" />
            <Skeleton className="h-11 rounded-control" />
          </>
        ) : error || !links ? (
          <div role="alert" className="space-y-2">
            <p className="text-sm text-ink-500">Não foi possível carregar os links de acesso.</p>
            <Button variant="secondary" size="sm" onClick={reload}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          (['TEAM_ADMIN', 'EQUIPE'] as const).map((audience) => (
            <AccessLinkBlock
              key={audience}
              link={links[audience]}
              rotating={rotating === audience}
              onRotate={() => setConfirming(audience)}
            />
          ))
        )}
      </div>

      <ConfirmDialog
        open={confirming !== null}
        title="Gerar novo link de acesso"
        description={
          confirming === 'EQUIPE'
            ? 'O link atual da equipe deixará de funcionar e os membros deste time serão desconectados. Os administradores não são afetados.'
            : 'O link atual dos administradores deixará de funcionar e eles serão desconectados. A equipe não é afetada.'
        }
        confirmLabel="Gerar novo link"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const audience = confirming;
          setConfirming(null);
          if (audience) void rotate(audience);
        }}
      />
    </section>
  );
}

/** Um endereco: estado, campo para copiar e renovacao. */
function AccessLinkBlock({
  link,
  rotating,
  onRotate,
}: {
  link: TeamAccessLink;
  rotating: boolean;
  onRotate: () => void;
}) {
  const label = TEAM_ACCESS_AUDIENCE_LABELS[link.audience];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold text-ink-900">{label}</h3>

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
              link.active
                ? 'size-1.5 rounded-full bg-success-600'
                : 'size-1.5 rounded-full bg-danger-600'
            }
          />
          {link.active ? 'Ativo' : 'Revogado'}
        </span>
      </div>

      <TeamAccessLinkField token={link.token} label={`Link de acesso — ${label}`} />

      <p className="text-[0.6875rem] text-ink-500">{HINTS[link.audience]}</p>

      <Button variant="secondary" size="sm" loading={rotating} onClick={onRotate}>
        {!rotating ? <RefreshCw aria-hidden="true" className="size-4" /> : null}
        Gerar novo link
      </Button>
    </div>
  );
}
