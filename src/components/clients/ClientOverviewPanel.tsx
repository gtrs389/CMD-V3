'use client';

import { CalendarClock, ListChecks, Link2, Users } from 'lucide-react';
import type { Client, Member } from '@/lib/types';
import { formatDateTime, formatRelative } from '@/lib/utils/date';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';

interface ClientOverviewPanelProps {
  client: Client;
  members: Member[];
}

/** Visao geral: apenas informacoes que realmente existem nesta etapa. */
export function ClientOverviewPanel({ client, members }: ClientOverviewPanelProps) {
  const activeFields = client.form.fields.filter((field) => field.enabled).length;
  const customFields = client.form.fields.filter((field) => field.systemKey === null).length;
  const lastMember = members.reduce<Member | null>((latest, member) => {
    if (!latest || member.createdAt > latest.createdAt) return member;
    return latest;
  }, null);

  const items = [
    {
      icon: <Users className="size-5" />,
      label: 'Integrantes',
      value: String(members.length),
      hint: lastMember ? `Ultimo: ${formatRelative(lastMember.createdAt)}` : 'Nenhum cadastro ainda',
    },
    {
      icon: <ListChecks className="size-5" />,
      label: 'Campos ativos',
      value: String(activeFields),
      hint: `${customFields} personalizados`,
    },
    {
      icon: <Link2 className="size-5" />,
      label: 'Convite',
      value: client.invite.active ? 'Ativo' : 'Desativado',
      hint: client.invite.rotatedAt
        ? `Renovado ${formatRelative(client.invite.rotatedAt)}`
        : 'Token original',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-card border border-line bg-surface p-4 shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-ink-500">{item.label}</p>
                <p className="mt-1 truncate text-2xl font-semibold text-ink-900">{item.value}</p>
              </div>
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-50 text-brand-700"
              >
                {item.icon}
              </span>
            </div>
            <p className="mt-2 truncate text-xs text-ink-500">{item.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dados do cliente</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="divide-y divide-line text-sm">
              <div className="grid gap-1 py-2.5 sm:grid-cols-3">
                <dt className="text-ink-500">Nome</dt>
                <dd className="font-medium break-words text-ink-900 sm:col-span-2">
                  {client.name}
                </dd>
              </div>
              <div className="grid gap-1 py-2.5 sm:grid-cols-3">
                <dt className="text-ink-500">E-mail</dt>
                <dd className="font-medium break-words text-ink-900 sm:col-span-2">
                  {client.email}
                </dd>
              </div>
              <div className="grid gap-1 py-2.5 sm:grid-cols-3">
                <dt className="text-ink-500">Criado em</dt>
                <dd className="font-medium text-ink-900 sm:col-span-2">
                  {formatDateTime(client.createdAt)}
                </dd>
              </div>
              <div className="grid gap-1 py-2.5 sm:grid-cols-3">
                <dt className="text-ink-500">Atualizado em</dt>
                <dd className="font-medium text-ink-900 sm:col-span-2">
                  {formatDateTime(client.updatedAt)}
                </dd>
              </div>
              {client.notes ? (
                <div className="grid gap-1 py-2.5 sm:grid-cols-3">
                  <dt className="text-ink-500">Observacoes</dt>
                  <dd className="break-words whitespace-pre-line text-ink-900 sm:col-span-2">
                    {client.notes}
                  </dd>
                </div>
              ) : null}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Formulario</CardTitle>
            <Badge tone={client.invite.active ? 'success' : 'neutral'}>
              {client.invite.active ? 'Recebendo cadastros' : 'Convite desativado'}
            </Badge>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <p className="flex items-center gap-2 text-ink-700">
              <CalendarClock aria-hidden="true" className="size-4 shrink-0 text-ink-400" />
              Atualizado em {formatDateTime(client.form.updatedAt)}
            </p>
            <p className="text-ink-500">
              {activeFields} campos ativos, sendo {customFields} criados pelo administrador.
            </p>
            <p className="text-ink-500">
              {client.form.privacy.enabled
                ? 'Aviso de privacidade habilitado no formulario publico.'
                : 'Aviso de privacidade desativado.'}
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
