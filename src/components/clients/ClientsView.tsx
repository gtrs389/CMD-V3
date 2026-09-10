'use client';

import { useMemo, useState } from 'react';
import { Building2, Plus, SearchX } from 'lucide-react';
import { useClientSummaries } from '@/hooks/use-clients';
import type { ClientSummary } from '@/lib/types';
import { byNewest } from '@/lib/utils/date';
import { matchesSearch } from '@/lib/utils/text';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { SearchInput } from '@/components/ui/SearchInput';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { ClientCard } from './ClientCard';
import { ClientFormModal } from './ClientFormModal';
import { DeleteClientDialog } from './DeleteClientDialog';
import { SampleDataButton } from './SampleDataButton';

export function ClientsView() {
  const { data, loading, error } = useClientSummaries();
  const [term, setTerm] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ClientSummary | null>(null);
  const [deleting, setDeleting] = useState<ClientSummary | null>(null);

  const clients = useMemo(() => [...(data ?? [])].sort(byNewest), [data]);

  const filtered = useMemo(
    () => clients.filter((client) => matchesSearch(term, client.name, client.email)),
    [clients, term],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Cadastre clientes, configure o formulario da equipe e compartilhe o link de convite."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Novo cliente
          </Button>
        }
      />

      {clients.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            id="busca-clientes"
            value={term}
            onChange={setTerm}
            label="Pesquisar clientes por nome ou e-mail"
            placeholder="Pesquisar por nome ou e-mail"
            className="sm:max-w-sm"
          />
          <p className="text-sm whitespace-nowrap text-ink-500">
            {filtered.length} de {clients.length}
          </p>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <ListSkeleton count={3} />
      ) : clients.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-6" />}
          title="Nenhum cliente cadastrado"
          description="Cadastre o primeiro cliente para gerar o formulario de equipe e o link de convite."
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => setCreating(true)}>
                <Plus aria-hidden="true" className="size-4" />
                Cadastrar cliente
              </Button>
              <SampleDataButton />
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<SearchX className="size-6" />}
          title="Nenhum resultado"
          description={`Nada encontrado para "${term}". Revise o termo pesquisado.`}
          action={
            <Button variant="secondary" onClick={() => setTerm('')}>
              Limpar pesquisa
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((client, index) => (
            <Reveal key={client.id} delay={Math.min(index * 50, 250)}>
              <ClientCard client={client} onEdit={setEditing} onDelete={setDeleting} />
            </Reveal>
          ))}
        </div>
      )}

      <ClientFormModal open={creating} onClose={() => setCreating(false)} />
      <ClientFormModal
        open={editing !== null}
        client={editing}
        onClose={() => setEditing(null)}
      />
      <DeleteClientDialog
        open={deleting !== null}
        client={deleting}
        memberCount={deleting?.memberCount ?? 0}
        onCancel={() => setDeleting(null)}
        onDeleted={() => setDeleting(null)}
      />
    </div>
  );
}
