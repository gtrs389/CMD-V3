'use client';

import { Smartphone } from 'lucide-react';
import type { Client } from '@/lib/types';
import { visibleFields, CONSENT_KEY } from '@/lib/validation/dynamic-form';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { DynamicFieldInput } from '@/components/form-renderer/DynamicFieldInput';
import { useDynamicForm } from '@/components/form-renderer/use-dynamic-form';

interface FormPreviewProps {
  client: Client;
}

/**
 * Pre-visualizacao fiel do formulario publico.
 * Usa exatamente os mesmos componentes da pagina de convite.
 */
export function FormPreview({ client }: FormPreviewProps) {
  const form = useDynamicForm(client.form);
  const fields = visibleFields(client.form);
  const { privacy } = client.form;

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-xs text-ink-500">
        <Smartphone aria-hidden="true" className="size-4" />
        Prévia interativa. Nada é salvo aqui.
      </p>

      <div className="mx-auto w-full max-w-md rounded-card border border-line bg-surface-muted p-3 sm:p-4">
        <div className="rounded-control bg-surface p-4 shadow-card">
          <div className="flex items-center gap-3 border-b border-line pb-4">
            <Avatar name={client.name} src={client.photo} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{client.name}</p>
              <p className="truncate text-xs text-ink-500">Cadastro de equipe</p>
            </div>
          </div>

          {client.form.introText ? (
            <p className="mt-4 text-sm text-ink-700">{client.form.introText}</p>
          ) : null}

          <div className="mt-4 space-y-4">
            {fields.map((field) => (
              <DynamicFieldInput
                key={field.id}
                field={field}
                idPrefix="previa"
                value={form.values[field.id] ?? null}
                error={form.errors[field.id]}
                onChange={(value) => form.setValue(field.id, value)}
              />
            ))}

            {privacy.enabled ? (
              <div className="rounded-control bg-ink-50 p-3">
                <p className="text-sm font-semibold text-ink-900">{privacy.title}</p>
                <p className="mt-1 text-xs whitespace-pre-line text-ink-700">{privacy.text}</p>
                {privacy.requireConsent ? (
                  <Checkbox
                    id="previa-consentimento"
                    className="mt-1"
                    label={privacy.consentLabel}
                    checked={form.values[CONSENT_KEY] === true}
                    onChange={(event) => form.setValue(CONSENT_KEY, event.target.checked)}
                  />
                ) : null}
              </div>
            ) : null}

            <Button fullWidth size="lg" onClick={() => form.validate()}>
              Enviar cadastro
            </Button>

            <p className="text-center text-xs text-ink-500">
              Toque em enviar para testar as validações.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
