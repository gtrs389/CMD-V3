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
import { useSession } from '@/components/layout/SessionProvider';
import { useMembers } from '@/hooks/use-members';
import { formatLongDate } from '@/lib/utils/date';
import { initials } from '@/lib/utils/text';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Menu } from '@/components/ui/Menu';
import { Skeleton } from '@/components/ui/Skeleton';
import { TabPanel, Tabs, type TabItem } from '@/components/ui/Tabs';
import { FormBuilderPanel } from '@/components/fields/FormBuilderPanel';
import { MembersPanel } from '@/components/members/MembersPanel';
import { ClientFormModal } from './ClientFormModal';
import { ClientOverviewPanel } from './ClientOverviewPanel';
import { DeleteClientDialog } from './DeleteClientDialog';
import { InvitePanel } from './InvitePanel';
import { InviteStatusPanel } from './InviteStatusPanel';

const TAB_IDS = ['visao-geral', 'equipe', 'formulario', 'convite'] as const;
export type TabId = (typeof TAB_IDS)[number];

/** Confere o parametro `aba` da URL antes de escolher a aba inicial. */
export function isTabId(value: string): value is TabId {
  return (TAB_IDS as readonly string[]).includes(value);
}

interface ClientDetailViewProps {
  clientId: string;
  /** Aba aberta ao entrar. Usada pelo atalho de recrutamento. */
  initialTab?: TabId;
}

/** Pagina individual do candidato, organizada em abas. */
export function ClientDetailView({ clientId, initialTab }: ClientDetailViewProps) {
  const router = useRouter();
  const { can } = useSession();
  const { data: client, loading, error, reload } = useClient(clientId);
  const { data: members, loading: loadingMembers } = useMembers(clientId);

  const [tab, setTab] = useState<TabId>(initialTab ?? 'visao-geral');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const memberList = members ?? [];

  // O candidato enxerga apenas o proprio cadastro, em leitura. As rotas de
  // gravacao recusam o perfil no servidor: aqui so evitamos oferecer a acao.
  const podeVoltar = can('client.list');
  const podeEditar = can('client.update');
  const podeExcluir = can('client.delete');
  const podeGerenciarConvite = can('invite.manage');

  // Area interna do formulario: exclusiva do ADMIN, e sempre completa. Sem
  // as duas permissoes nao ha aba, cartao nem previa, a pagina recusa
  // `?aba=formulario` e a configuracao dos campos nem chega nesta resposta.
  const mostrarFormulario = can('form.view') && can('form.manage');

  // Perfil sem acesso ao formulario nunca fica preso na aba: qualquer
  // tentativa cai na visao geral.
  const abaAtiva: TabId = tab === 'formulario' && !mostrarFormulario ? 'visao-geral' : tab;

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

  if (!client) {
    return (
      <EmptyState
        icon={<Building2 className="size-6" />}
        title="Candidato não encontrado"
        description="O candidato pode ter sido excluido por outra pessoa."
        action={
          <Link
            href="/candidatos"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-brand-700 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-800"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Voltar para candidatos
          </Link>
        }
      />
    );
  }

  const tabs: TabItem[] = [
    { id: 'visao-geral', label: 'Visão geral', icon: <LayoutList className="size-4" /> },
    {
      id: 'equipe',
      label: 'Equipe',
      icon: <Users className="size-4" />,
      badge: (
        <span className="rounded-pill bg-accent-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-accent-700 tabular-nums">
          {memberList.length}
        </span>
      ),
    },
    ...(mostrarFormulario
      ? [{ id: 'formulario', label: 'Formulário', icon: <FileText className="size-4" /> }]
      : []),
    { id: 'convite', label: 'Convite', icon: <Link2 className="size-4" /> },
  ];

  return (
    <div className="space-y-3">
      {podeVoltar ? (
        <Link
          href="/candidatos"
          className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-ink-500 transition-colors hover:text-ink-900"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          Voltar para candidatos
        </Link>
      ) : null}

      <header className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {client.photo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={client.photo}
              alt={`Foto de ${client.name}`}
              className="size-16 shrink-0 rounded-card border border-line object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-16 shrink-0 items-center justify-center rounded-card border border-line bg-ink-100 text-lg font-semibold text-ink-500"
            >
              {initials(client.name)}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl leading-tight font-bold tracking-tight break-words text-ink-900 sm:text-[1.375rem]">
                {client.name}
              </h1>
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
                {client.invite.active ? 'Convite ativo' : 'Convite inativo'}
              </span>
            </div>

            <p className="mt-1 truncate text-[0.8125rem] text-ink-500">{client.email}</p>
            <p className="mt-0.5 text-xs text-ink-400">
              Candidato desde {formatLongDate(client.createdAt)}
            </p>
          </div>

          {!podeGerenciarConvite ? (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setTab('convite')}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill bg-accent-600 px-4 text-sm font-medium text-white shadow-card transition-colors hover:bg-accent-700"
              >
                <Link2 aria-hidden="true" className="size-4" />
                Gerar Link
              </button>
            </div>
          ) : null}

          {podeEditar || podeExcluir ? (
            <div className="flex shrink-0 items-center gap-2">
              {podeEditar ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill border border-line bg-surface px-4 text-sm font-medium text-accent-600 shadow-card transition-colors hover:bg-accent-50"
                >
                  <Pencil aria-hidden="true" className="size-4" />
                  Editar candidato
                </button>
              ) : null}

              <div className="rounded-control border border-line bg-surface shadow-card">
                <Menu
                  label={`Ações de ${client.name}`}
                  actions={[
                    ...(podeEditar
                      ? [
                          {
                            id: 'editar',
                            label: 'Editar candidato',
                            icon: <Pencil className="size-4" />,
                            onSelect: () => setEditing(true),
                          },
                        ]
                      : []),
                    ...(podeExcluir
                      ? [
                          {
                            id: 'excluir',
                            label: 'Excluir candidato',
                            icon: <Trash2 className="size-4" />,
                            tone: 'danger' as const,
                            onSelect: () => setDeleting(true),
                          },
                        ]
                      : []),
                  ]}
                />
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <Tabs
        variant="underline"
        label="Seções do candidato"
        items={tabs}
        active={abaAtiva}
        onChange={(id) => setTab(id as TabId)}
      />

      <TabPanel id="visao-geral" active={abaAtiva}>
        <ClientOverviewPanel
          client={client}
          members={memberList}
          onOpenTab={setTab}
          onOpenForm={mostrarFormulario ? () => setTab('formulario') : undefined}
          // O candidato acessa o link pelo botao do cabecalho: o cartao
          // "Meu link de cadastro" sai da visao geral.
          showInviteCard={podeGerenciarConvite}
        />
      </TabPanel>

      <TabPanel id="equipe" active={abaAtiva}>
        <MembersPanel client={client} members={memberList} loading={loadingMembers} />
      </TabPanel>

      {mostrarFormulario ? (
        <TabPanel id="formulario" active={abaAtiva}>
          <FormBuilderPanel client={client} members={memberList} />
        </TabPanel>
      ) : null}

      <TabPanel id="convite" active={abaAtiva}>
        {podeGerenciarConvite ? (
          <InvitePanel client={client} />
        ) : (
          <InviteStatusPanel client={client} />
        )}
      </TabPanel>

      <ClientFormModal open={editing} client={client} onClose={() => setEditing(false)} />

      <DeleteClientDialog
        open={deleting}
        client={client}
        memberCount={memberList.length}
        onCancel={() => setDeleting(false)}
        onDeleted={() => {
          setDeleting(false);
          router.replace('/candidatos');
        }}
      />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-40" />
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
