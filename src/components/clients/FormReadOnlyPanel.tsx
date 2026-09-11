'use client';

import { CheckCircle2, ListChecks, ShieldCheck } from 'lucide-react';
import type { Client } from '@/lib/types';
import { FIELD_TYPE_LABELS } from '@/lib/domain/form-config';
import { formatDateTime } from '@/lib/utils/date';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { FormPreview } from '@/components/fields/FormPreview';

/**
 * Formulario em modo leitura.
 *
 * Usado pelo proprio candidato: mostra como o formulario esta configurado,
 * sem nenhuma acao de edicao. As rotas de gravacao tambem recusam o perfil.
 */
export function FormReadOnlyPanel({ client }: { client: Client }) {
  const fields = [...client.form.fields].sort((a, b) => a.order - b.order);
  const ativos = fields.filter((field) => field.enabled);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Campos do formulário</CardTitle>
            <CardDescription>
              {ativos.length} de {fields.length} campos ativos. Atualizado em{' '}
              {formatDateTime(client.form.updatedAt)}.
            </CardDescription>
          </div>
          <Badge tone="neutral">Somente leitura</Badge>
        </CardHeader>

        <CardBody>
          <ul className="divide-y divide-line">
            {fields.map((field) => (
              <li key={field.id} className="flex items-center gap-3 py-2.5">
                <ListChecks aria-hidden="true" className="size-4 shrink-0 text-ink-400" />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{field.label}</p>
                  <p className="text-xs text-ink-500">{FIELD_TYPE_LABELS[field.type]}</p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {field.required ? <Badge tone="brand">Obrigatório</Badge> : null}
                  <Badge tone={field.enabled ? 'success' : 'neutral'}>
                    {field.enabled ? 'Ativo' : 'Desativado'}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Aviso de privacidade</CardTitle>
          </div>
        </CardHeader>
        <CardBody className="space-y-2 text-sm text-ink-700">
          <p className="flex items-center gap-2">
            {client.form.privacy.enabled ? (
              <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-success-600" />
            ) : (
              <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-ink-400" />
            )}
            {client.form.privacy.enabled
              ? 'Exibido no formulário público.'
              : 'Desativado no formulário público.'}
          </p>
          {client.form.privacy.requireConsent ? (
            <p className="flex items-center gap-2 text-ink-500">
              <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
              O aceite é obrigatório antes do envio.
            </p>
          ) : null}
        </CardBody>
      </Card>

      <FormPreview client={client} />
    </div>
  );
}
