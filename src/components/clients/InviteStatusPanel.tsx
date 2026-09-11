'use client';

import { Link2 } from 'lucide-react';
import type { Client } from '@/lib/types';
import { formatDateTime } from '@/lib/utils/date';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';

/**
 * Situacao do convite em modo leitura.
 *
 * Nenhum token e exibido e nenhuma acao e oferecida: gerar, renovar ou
 * desativar o convite continua sendo do administrador, tambem no servidor.
 */
export function InviteStatusPanel({ client }: { client: Client }) {
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Situação do convite</CardTitle>
          <CardDescription>
            O link de cadastro é gerenciado pela administração do CMD.
          </CardDescription>
        </div>
        <Badge tone={client.invite.active ? 'success' : 'neutral'}>
          {client.invite.active ? 'Convite ativo' : 'Convite desativado'}
        </Badge>
      </CardHeader>

      <CardBody className="space-y-3">
        <p className="flex items-start gap-2 rounded-control border border-line bg-ink-50 p-3 text-sm text-ink-700">
          <Link2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-700" />
          <span className="min-w-0">
            {client.invite.active
              ? 'Os links da sua candidatura estão aceitando novos cadastros: o seu e o de cada integrante.'
              : 'Nenhum link da sua candidatura está aceitando cadastros no momento.'}
          </span>
        </p>

        <dl className="grid gap-3 rounded-control bg-ink-50 p-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs text-ink-500">Criado em</dt>
            <dd className="font-medium text-ink-900">{formatDateTime(client.invite.createdAt)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-ink-500">Última renovação</dt>
            <dd className="font-medium text-ink-900">
              {client.invite.rotatedAt ? formatDateTime(client.invite.rotatedAt) : 'Nunca'}
            </dd>
          </div>
        </dl>
      </CardBody>
    </Card>
  );
}
