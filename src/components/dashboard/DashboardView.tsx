'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, Plus, UserPlus, Users } from 'lucide-react';
import { useClientSummaries } from '@/hooks/use-clients';
import { useAllMembers } from '@/hooks/use-members';
import { byNewest, formatRelative } from '@/lib/utils/date';
import { formatPhone } from '@/lib/utils/phone';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { Skeleton } from '@/components/ui/Skeleton';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import { StatCard } from './StatCard';

const RECENT_WINDOW_DAYS = 7;

export function DashboardView() {
  const [creating, setCreating] = useState(false);
  const {
    data: clients,
    loading: loadingClients,
    error: clientsError,
    reload: reloadClients,
  } = useClientSummaries();
  const {
    data: members,
    loading: loadingMembers,
    error: membersError,
    reload: reloadMembers,
  } = useAllMembers();

  const loading = loadingClients || loadingMembers;
  const error = clientsError ?? membersError;

  const clientList = useMemo(() => clients ?? [], [clients]);
  const memberList = useMemo(() => members ?? [], [members]);

  // Fixa o instante da montagem: manter a contagem estavel entre renderizacoes.
  const [mountedAt] = useState(() => Date.now());

  const recentCount = useMemo(() => {
    const limit = mountedAt - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    return memberList.filter((member) => new Date(member.createdAt).getTime() >= limit).length;
  }, [memberList, mountedAt]);

  const recentMembers = useMemo(
    () => [...memberList].sort(byNewest).slice(0, 5),
    [memberList],
  );

  const recentClients = useMemo(
    () => [...clientList].sort(byNewest).slice(0, 5),
    [clientList],
  );

  const clientNameById = useMemo(
    () => new Map(clientList.map((client) => [client.id, client.name])),
    [clientList],
  );

  const isEmpty = !loading && clientList.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel"
        description="Resumo da operacao com os dados registrados no sistema."
        actions={
          <>
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" className="size-4" />
              Novo cliente
            </Button>
            <Link
              href="/clientes"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-4 text-sm font-medium text-ink-900 shadow-card transition-colors hover:bg-ink-50"
            >
              Ver clientes
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </>
        }
      />

      {error ? (
        <div
          role="alert"
          className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
        >
          <p>{error}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => {
              reloadClients();
              reloadMembers();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Reveal>
          <StatCard
            label="Clientes"
            value={clientList.length}
            hint="Total de clientes cadastrados no painel."
            icon={<Building2 className="size-5" />}
            loading={loading}
          />
        </Reveal>
        <Reveal delay={60}>
          <StatCard
            label="Integrantes"
            value={memberList.length}
            hint="Soma das equipes de todos os clientes."
            icon={<Users className="size-5" />}
            loading={loading}
          />
        </Reveal>
        <Reveal delay={120} className="sm:col-span-2 xl:col-span-1">
          <StatCard
            label="Cadastros recentes"
            value={recentCount}
            hint={`Integrantes cadastrados nos ultimos ${RECENT_WINDOW_DAYS} dias.`}
            icon={<UserPlus className="size-5" />}
            loading={loading}
          />
        </Reveal>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={<Building2 className="size-6" />}
          title="Nenhum cliente cadastrado ainda"
          description="Cadastre o primeiro cliente para montar o formulario de equipe e gerar o link de convite."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" className="size-4" />
              Cadastrar cliente
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Reveal>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Cadastros recentes</CardTitle>
                <Link
                  href="/clientes"
                  className="-my-2 inline-flex min-h-11 items-center rounded-control px-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 hover:text-brand-800"
                >
                  Ver clientes
                </Link>
              </CardHeader>
              <CardBody>
                {loading ? (
                  <RowsSkeleton />
                ) : recentMembers.length === 0 ? (
                  <EmptyState
                    compact
                    className="border-0 bg-transparent"
                    icon={<UserPlus className="size-5" />}
                    title="Nenhum integrante cadastrado"
                    description="Compartilhe o link de convite de um cliente para receber os primeiros cadastros."
                  />
                ) : (
                  <ul className="divide-y divide-line">
                    {recentMembers.map((member) => (
                      <li key={member.id} className="flex items-center gap-3 py-3 first:pt-0">
                        <Avatar name={member.name} src={member.photo} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink-900">{member.name}</p>
                          <p className="truncate text-xs text-ink-500">
                            {clientNameById.get(member.clientId) ?? 'Cliente removido'}
                            {member.phone ? ` — ${formatPhone(member.phone)}` : ''}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs whitespace-nowrap text-ink-500">
                          {formatRelative(member.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </Reveal>

          <Reveal delay={80}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Clientes adicionados recentemente</CardTitle>
              </CardHeader>
              <CardBody>
                {loading ? (
                  <RowsSkeleton />
                ) : (
                  <ul className="divide-y divide-line">
                    {recentClients.map((client) => (
                      <li key={client.id}>
                        <Link
                          href={`/clientes/${client.id}`}
                          className="-mx-2 flex min-h-11 items-center gap-3 rounded-control px-2 py-3 transition-colors hover:bg-ink-50"
                        >
                          <Avatar name={client.name} src={client.photo} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-ink-900">
                              {client.name}
                            </p>
                            <p className="truncate text-xs text-ink-500">
                              {client.memberCount} na equipe
                            </p>
                          </div>
                          <span className="shrink-0 text-xs whitespace-nowrap text-ink-500">
                            {formatRelative(client.createdAt)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </Reveal>
        </div>
      )}

      <ClientFormModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
