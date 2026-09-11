'use client';

import { useState } from 'react';
import { LayoutList, Users } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/permissions';
import { formatLongDate } from '@/lib/utils/date';
import { initials } from '@/lib/utils/text';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { TabPanel, Tabs, type TabItem } from '@/components/ui/Tabs';
import { ClientOverviewPanel } from '@/components/clients/ClientOverviewPanel';
import { InviteLinkModal } from '@/components/clients/InviteLinkModal';
import { MembersPanel } from '@/components/members/MembersPanel';
import { useTeamOverview } from '@/hooks/use-team';

/** As abas do integrante: o formulario e area interna do ADMIN. */
type TabId = 'visao-geral' | 'equipe';

/**
 * Pagina do integrante da equipe.
 *
 * Mesma estrutura e mesmos quadros da pagina do candidato: cabecalho, abas e
 * os paineis de visao geral e equipe sao exatamente os mesmos componentes. O
 * link pessoal abre em dialogo, pelo cartao da visao geral.
 *
 * O que muda e o escopo, e ele vem do servidor: a lista traz somente quem se
 * cadastrou pelo link deste integrante e o convite e o link pessoal dele.
 * Nenhuma acao de escrita aparece porque o perfil nao tem as permissoes — e
 * as rotas recusam do mesmo jeito.
 *
 * A area interna do formulario nao existe aqui: sem `form.view` nao ha aba,
 * cartao nem previa, e `/api/equipe` nao devolve campo, opcao, texto ou
 * contagem do formulario. Trocar a URL ou acrescentar parametro nao abre
 * nada, porque a aba nao existe e os dados nunca sao carregados.
 */
export function TeamDetailView() {
  const { data: overview, loading, error, reload } = useTeamOverview();
  const [tab, setTab] = useState<TabId>('visao-geral');
  const [invite, setInvite] = useState(false);

  if (loading) return <DetailSkeleton />;

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
      >
        <p>{error}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (!overview) return null;

  const { profile, client, members } = overview;

  const tabs: TabItem[] = [
    { id: 'visao-geral', label: 'Visão geral', icon: <LayoutList className="size-4" /> },
    {
      id: 'equipe',
      label: 'Equipe',
      icon: <Users className="size-4" />,
      badge: (
        <span className="rounded-pill bg-accent-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-accent-700 tabular-nums">
          {members.length}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <header className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {profile.photo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={profile.photo}
              alt={`Foto de ${profile.name}`}
              className="size-16 shrink-0 rounded-card border border-line object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-16 shrink-0 items-center justify-center rounded-card border border-line bg-ink-100 text-lg font-semibold text-ink-500"
            >
              {initials(profile.name)}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl leading-tight font-bold tracking-tight break-words text-ink-900 sm:text-[1.375rem]">
                {profile.name}
              </h1>
              <span className="inline-flex shrink-0 items-center rounded-pill bg-accent-50 px-2 py-1 text-[0.6875rem] font-medium whitespace-nowrap text-accent-700">
                {ROLE_LABELS.EQUIPE}
              </span>
              <span
                className={
                  client.invite.active
                    ? 'inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-success-50 px-2 py-1 text-[0.6875rem] font-medium whitespace-nowrap text-success-600'
                    : 'inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-danger-50 px-2 py-1 text-[0.6875rem] font-medium whitespace-nowrap text-danger-600'
                }
              >
                <span
                  aria-hidden="true"
                  className={
                    client.invite.active
                      ? 'size-1.5 rounded-full bg-success-600'
                      : 'size-1.5 rounded-full bg-danger-600'
                  }
                />
                {client.invite.active ? 'Link ativo' : 'Link inativo'}
              </span>
            </div>

            <p className="mt-1 truncate text-[0.8125rem] text-ink-500">{profile.email}</p>
            <p className="mt-0.5 text-xs text-ink-400">
              Equipe de {profile.candidateName} desde {formatLongDate(profile.joinedAt)}
            </p>
          </div>
        </div>
      </header>

      <Tabs
        variant="underline"
        label="Seções da minha mobilização"
        items={tabs}
        active={tab}
        onChange={(id) => setTab(id as TabId)}
      />

      <TabPanel id="visao-geral" active={tab}>
        <ClientOverviewPanel
          client={client}
          members={members}
          onOpenTab={setTab}
          onManageInvite={() => setInvite(true)}
        />
      </TabPanel>

      <TabPanel id="equipe" active={tab}>
        <MembersPanel client={client} members={members} loading={false} />
      </TabPanel>

      <InviteLinkModal
        open={invite}
        client={client}
        canManage={false}
        onClose={() => setInvite(false)}
      />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-card" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      </div>
      <Skeleton className="h-12 w-full rounded-card" />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Skeleton className="h-64 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    </div>
  );
}
