'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { Check, Copy, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import type { TeamAccessAudience, TeamAccessLink } from '@/lib/types';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { useOrigin } from '@/hooks/use-origin';
import { copyText } from '@/lib/utils/clipboard';
import { teamAccessPath } from '@/lib/utils/url';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';

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
 * Os links de acesso so aceitam os telefones do proprio publico: o do
 * administrador nao deixa um membro entrar, e o da equipe nao deixa um
 * administrador entrar.
 *
 * Os enderecos de acesso sao PERMANENTES e existem desde a criacao do time:
 * aqui eles apenas sao copiados. Trocar o endereco derrubaria todo mundo
 * daquele publico de uma vez e nao resolve problema nenhum do dia a dia,
 * entao essa acao nao e oferecida.
 *
 * Quem chama decide QUAIS enderecos aparecem: o ADMIN geral ve os dois, e o
 * Administrador do time ve apenas o da equipe, que e quem ele convida. A
 * rota confere o perfil de novo — pedir aqui um endereco que o perfil nao
 * alcanca nao traz nada na resposta.
 */

/** O que a rota devolve: so os enderecos que o perfil pode ver. */
type VisibleLinks = Partial<Record<TeamAccessAudience, TeamAccessLink>>;

interface TeamLinksBarProps {
  clientId: string;
  /** Botao do link de cadastro: o do time (ADMIN) ou o proprio (Administrador). */
  generateButton: ReactNode;
  /**
   * Enderecos de acesso oferecidos nesta tela. Lista vazia nem consulta a
   * rota. O servidor confere de novo: pedir um publico que o perfil nao
   * alcanca simplesmente nao vem na resposta.
   */
  audiences?: readonly TeamAccessAudience[];
}

/** Como cada link de acesso se apresenta. */
const ACCESS: Record<
  TeamAccessAudience,
  { label: string; icon: typeof ShieldCheck; copied: string }
> = {
  TEAM_ADMIN: {
    label: 'Link do administrador',
    icon: ShieldCheck,
    copied: 'Link do administrador do time copiado.',
  },
  EQUIPE: {
    label: 'Link da equipe',
    icon: Users,
    copied: 'Link da equipe copiado.',
  },
};

export function TeamLinksBar({
  clientId,
  generateButton,
  audiences = [],
}: TeamLinksBarProps) {
  const toast = useToast();
  const origin = useOrigin();

  const loader = useCallback(
    () => api<{ accessLinks: VisibleLinks }>(`/api/clients/${clientId}/acesso`),
    [clientId],
  );
  const { data, loading, error, reload } = useRepositoryQuery(loader);

  const [copied, setCopied] = useState<TeamAccessAudience | null>(null);

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

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Recrutamento: o unico que gera um endereco novo a cada clique. */}
      {generateButton}

      {audiences.length > 0 ? (
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
          audiences.map((audience) => {
            const link = links[audience];
            if (!link) return null;

            return (
              <AccessButton
                key={audience}
                audience={audience}
                link={link}
                copied={copied === audience}
                onCopy={() => void copy(audience, link)}
              />
            );
          })
        )
      ) : null}
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
