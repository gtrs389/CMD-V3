'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalLink, Pencil, Trash2, UserRound, Users } from 'lucide-react';
import type { ClientSummary } from '@/lib/types';
import { formatRelative } from '@/lib/utils/date';
import { pluralize } from '@/lib/utils/text';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Menu } from '@/components/ui/Menu';

interface ClientCardProps {
  client: ClientSummary;
  onEdit: (client: ClientSummary) => void;
  onDelete: (client: ClientSummary) => void;
}

/** Cartao de cliente: foto, nome, e-mail, total de equipe e acoes principais. */
export function ClientCard({ client, onEdit, onDelete }: ClientCardProps) {
  const router = useRouter();

  return (
    <article className="flex flex-col rounded-card border border-line bg-surface shadow-card transition-shadow duration-200 hover:shadow-raised">
      <div className="flex items-start gap-3 p-4">
        <Avatar name={client.name} src={client.photo} size="lg" />

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-ink-900">{client.name}</h3>
          <p className="truncate text-sm text-ink-500">{client.email}</p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="brand">
              <Users aria-hidden="true" className="size-3.5" />
              {client.memberCount} {pluralize(client.memberCount, 'integrante', 'integrantes')}
            </Badge>
            <Badge tone={client.invite.active ? 'success' : 'neutral'}>
              {client.invite.active ? 'Convite ativo' : 'Convite desativado'}
            </Badge>
          </div>
        </div>

        <Menu
          actions={[
            {
              id: 'abrir',
              label: 'Abrir página do cliente',
              icon: <ExternalLink className="size-4" />,
              onSelect: () => router.push(`/clientes/${client.id}`),
            },
            {
              id: 'editar',
              label: 'Editar cliente',
              icon: <Pencil className="size-4" />,
              onSelect: () => onEdit(client),
            },
            {
              id: 'excluir',
              label: 'Excluir cliente',
              icon: <Trash2 className="size-4" />,
              tone: 'danger',
              onSelect: () => onDelete(client),
            },
          ]}
        />
      </div>

      <dl className="grid grid-cols-2 gap-3 border-t border-line px-4 py-3 text-xs">
        <div className="min-w-0">
          <dt className="text-ink-500">Criado</dt>
          <dd className="truncate font-medium text-ink-700">{formatRelative(client.createdAt)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ink-500">Último cadastro</dt>
          <dd className="truncate font-medium text-ink-700">
            {client.lastMemberAt ? formatRelative(client.lastMemberAt) : 'Nenhum'}
          </dd>
        </div>
      </dl>

      <div className="mt-auto border-t border-line p-3">
        <Link
          href={`/clientes/${client.id}`}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-control bg-brand-700 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-800"
        >
          <UserRound aria-hidden="true" className="size-4" />
          Abrir cliente
        </Link>
      </div>
    </article>
  );
}
