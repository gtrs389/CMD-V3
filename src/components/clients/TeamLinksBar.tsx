'use client';

import { useCallback, useState } from 'react';
import { Check, Copy, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import type { Client, TeamAccessAudience, TeamAccessLink, TeamAccessLinks } from '@/lib/types';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { useOrigin } from '@/hooks/use-origin';
import { copyText } from '@/lib/utils/clipboard';
import { teamAccessPath } from '@/lib/utils/url';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Menu } from '@/components/ui/Menu';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { GenerateClientInviteButton } from './GenerateClientInviteButton';

/**
 * Os tres links do time, juntos e nomeados, no cabecalho da pagina.
 *
 * Sao coisas diferentes e o rotulo de cada botao diz exatamente qual e:
 *
 *  - "Link de cadastro"        formulario publico de recrutamento. Uso unico,
 *                              com prazo, gerado na hora e ja copiado.
 *  - "Link do administrador"   entrada no painel para quem administra o time.
 *                              Permanente, nao expira e nao e consumido.
 *  - "Link da equipe"          entrada no painel para os membros da equipe.
 *                              Tambem permanente.
 *
 * Os dois links de acesso so aceitam os telefones do proprio publico: o do
 * administrador nao deixa um membro entrar, e o da equipe nao deixa um
 * administrador entrar.
 *
 * Copiar nunca gera endereco novo. Gerar um novo invalida o anterior daquele
 * publico na hora e desconecta so as pessoas dele; por isso a renovacao fica
 * no menu ao lado, atras de uma confirmacao.
 *
 * Exclusivo do ADMIN geral: a rota de acesso confere o perfil, e quem nao o
 * tem nao recebe nem os enderecos.
 */

interface TeamLinksBarProps {
  client: Client;
  /** Liga os dois links de acesso ao painel. Somente o ADMIN geral os ve. */
  showAccessLinks: boolean;
}

/** Como cada link de acesso se apresenta. */
const ACCESS: Record<
  TeamAccessAudience,
  { label: string; icon: typeof ShieldCheck; copied: string; confirm: string }
> = {
  TEAM_ADMIN: {
    label: 'Link do administrador',
    icon: ShieldCheck,
    copied: 'Link do administrador do time copiado.',
    confirm:
      'O link atual dos administradores deixará de funcionar e eles serão desconectados. A equipe não é afetada.',
  },
  EQUIPE: {
    label: 'Link da equipe',
    icon: Users,
    copied: 'Link da equipe copiado.',
    confirm:
      'O link atual da equipe deixará de funcionar e os membros deste time serão desconectados. Os administradores não são afetados.',
  },
};

export function TeamLinksBar({ client, showAccessLinks }: TeamLinksBarProps) {
  const toast = useToast();
  const origin = useOrigin();

  const loader = useCallback(
    () => api<{ accessLinks: TeamAccessLinks }>(`/api/clients/${client.id}/acesso`),
    [client.id],
  );
  const { data, loading, error, reload } = useRepositoryQuery(loader);

  const [copied, setCopied] = useState<TeamAccessAudience | null>(null);
  const [confirming, setConfirming] = useState<TeamAccessAudience | null>(null);
  const [rotating, setRotating] = useState<TeamAccessAudience | null>(null);

  const links = data?.accessLinks ?? null;

  async function copy(audience: TeamAccessAudience, link: TeamAccessLink) {
    const url = `${origin}${teamAccessPath(link.token)}`;
    if (!(await copyText(url))) {
      toast.error('Não foi possível copiar. Tente novamente.');
      return;
    }
    setCopied(audience);
    toast.success(ACCESS[audience].copied);
    window.setTimeout(() => setCopied((atual) => (atual === audience ? null : atual)), 2000);
  }

  async function rotate(audience: TeamAccessAudience) {
    setRotating(audience);
    try {
      await api<{ accessLink: TeamAccessLink }>(`/api/clients/${client.id}/acesso`, {
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
    <div className="flex flex-wrap items-center gap-2">
      {/* Recrutamento: o unico que gera um endereco novo a cada clique. */}
      <GenerateClientInviteButton client={client} label="Link de cadastro" />

      {showAccessLinks ? (
        loading ? (
          <>
            <Skeleton className="h-11 w-44 rounded-pill" />
            <Skeleton className="h-11 w-36 rounded-pill" />
          </>
        ) : error || !links ? (
          <button
            type="button"
            onClick={reload}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill border border-line bg-surface px-4 text-sm font-medium text-ink-500 transition-colors hover:bg-ink-50"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Recarregar links de acesso
          </button>
        ) : (
          <>
            {(['TEAM_ADMIN', 'EQUIPE'] as const).map((audience) => (
              <AccessButton
                key={audience}
                audience={audience}
                link={links[audience]}
                copied={copied === audience}
                onCopy={() => void copy(audience, links[audience])}
              />
            ))}

            <div className="rounded-control border border-line bg-surface shadow-card">
              <Menu
                label="Gerar novos links de acesso"
                actions={(['TEAM_ADMIN', 'EQUIPE'] as const).map((audience) => ({
                  id: `rotate-${audience}`,
                  label: `Gerar novo ${ACCESS[audience].label.toLowerCase()}`,
                  icon: <RefreshCw className="size-4" />,
                  disabled: rotating !== null,
                  onSelect: () => setConfirming(audience),
                }))}
              />
            </div>
          </>
        )
      ) : null}

      <ConfirmDialog
        open={confirming !== null}
        title="Gerar novo link de acesso"
        description={confirming ? ACCESS[confirming].confirm : ''}
        confirmLabel="Gerar novo link"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const audience = confirming;
          setConfirming(null);
          if (audience) void rotate(audience);
        }}
      />
    </div>
  );
}

/**
 * Um link de acesso: copia com um clique.
 *
 * O endereco nao e exibido de proposito — ele e sempre o mesmo e nao precisa
 * ficar na tela. Link revogado aparece marcado, para ninguem enviar um
 * endereco que ja nao funciona.
 */
function AccessButton({
  audience,
  link,
  copied,
  onCopy,
}: {
  audience: TeamAccessAudience;
  link: TeamAccessLink;
  copied: boolean;
  onCopy: () => void;
}) {
  const { label, icon: Icon } = ACCESS[audience];

  return (
    <button
      type="button"
      onClick={onCopy}
      title={`Copiar o ${label.toLowerCase()}`}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill border border-line bg-surface px-4 text-sm font-medium whitespace-nowrap text-ink-900 shadow-card transition-colors hover:bg-ink-50"
    >
      <Icon aria-hidden="true" className="size-4 text-accent-600" />
      {label}
      {copied ? (
        <Check aria-hidden="true" className="size-4 text-success-600" />
      ) : (
        <Copy aria-hidden="true" className="size-4 text-ink-500" />
      )}
      {!link.active ? (
        <span className="rounded-pill bg-danger-50 px-1.5 py-0.5 text-[0.625rem] font-semibold text-danger-600">
          revogado
        </span>
      ) : null}
    </button>
  );
}
