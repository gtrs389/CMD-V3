'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  FileText,
  LayoutList,
  Link2,
  Pencil,
  Trash2,
  Users,
} from 'lucide-react';
import { useClient } from '@/hooks/use-clients';
import { useMembers } from '@/hooks/use-members';
import { pluralize } from '@/lib/utils/text';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { TabPanel, Tabs, type TabItem } from '@/components/ui/Tabs';
import { FormBuilderPanel } from '@/components/fields/FormBuilderPanel';
import { MembersPanel } from '@/components/members/MembersPanel';
import { ClientFormModal } from './ClientFormModal';
import { ClientOverviewPanel } from './ClientOverviewPanel';
import { DeleteClientDialog } from './DeleteClientDialog';
import { InvitePanel } from './InvitePanel';

type TabId = 'visao-geral' | 'equipe' | 'formulario' | 'convite';

interface ClientDetailViewProps {
  clientId: string;
}

/** Pagina individual do cliente, organizada em abas. */
export function ClientDetailView({ clientId }: ClientDetailViewProps) {
  const router = useRouter();
  const { data: client, loading } = useClient(clientId);
  const { data: members, loading: loadingMembers } = useMembers(clientId);

  const [tab, setTab] = useState<TabId>('visao-geral');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const memberList = members ?? [];

  if (loading) return <DetailSkeleton />;

  if (!client) {
    return (
      <EmptyState
        icon={<Building2 className="size-6" />}
        title="Cliente nao encontrado"
        description="O cliente pode ter sido excluido ou os dados deste navegador foram limpos."
        action={
          <Link
            href="/clientes"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-brand-700 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-800"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Voltar para clientes
          </Link>
        }
      />
    );
  }

  const tabs: TabItem[] = [
    { id: 'visao-geral', label: 'Visao geral', icon: <LayoutList className="size-4" /> },
    {
      id: 'equipe',
      label: 'Equipe',
      icon: <Users className="size-4" />,
      badge: (
        <span className="rounded-pill bg-white/20 px-1.5 text-xs tabular-nums">
          {memberList.length}
        </span>
      ),
    },
    { id: 'formulario', label: 'Formulario', icon: <FileText className="size-4" /> },
    { id: 'convite', label: 'Link de convite', icon: <Link2 className="size-4" /> },
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/clientes"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Clientes
      </Link>

      <Card>
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={client.name} src={client.photo} size="xl" />

          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight break-words text-ink-900 sm:text-2xl">
              {client.name}
            </h1>
            <p className="mt-0.5 truncate text-sm text-ink-500">{client.email}</p>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone="brand">
                <Users aria-hidden="true" className="size-3.5" />
                {memberList.length} {pluralize(memberList.length, 'integrante', 'integrantes')}
              </Badge>
              <Badge tone={client.invite.active ? 'success' : 'neutral'}>
                {client.invite.active ? 'Convite ativo' : 'Convite desativado'}
              </Badge>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil aria-hidden="true" className="size-4" />
              Editar cliente
            </Button>
            <Button
              variant="ghost"
              className="text-danger-600 hover:bg-danger-50"
              onClick={() => setDeleting(true)}
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Excluir
            </Button>
          </div>
        </CardBody>
      </Card>

      <Tabs
        label="Secoes do cliente"
        items={tabs}
        active={tab}
        onChange={(id) => setTab(id as TabId)}
      />

      <TabPanel id="visao-geral" active={tab}>
        <ClientOverviewPanel client={client} members={memberList} />
      </TabPanel>

      <TabPanel id="equipe" active={tab}>
        <MembersPanel client={client} members={memberList} loading={loadingMembers} />
      </TabPanel>

      <TabPanel id="formulario" active={tab}>
        <FormBuilderPanel client={client} members={memberList} />
      </TabPanel>

      <TabPanel id="convite" active={tab}>
        <InvitePanel client={client} />
      </TabPanel>

      <ClientFormModal open={editing} client={client} onClose={() => setEditing(false)} />

      <DeleteClientDialog
        open={deleting}
        client={client}
        memberCount={memberList.length}
        onCancel={() => setDeleting(false)}
        onDeleted={() => {
          setDeleting(false);
          router.replace('/clientes');
        }}
      />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-24" />
      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="flex items-center gap-4">
          <Skeleton className="size-20 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      </div>
      <Skeleton className="h-11 w-full" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-card" />
        ))}
      </div>
    </div>
  );
}
