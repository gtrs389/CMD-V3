'use client';

import { Smartphone } from 'lucide-react';
import type { ClientFormConfig } from '@/lib/types';
import { visibleFields, CONSENT_KEY } from '@/lib/validation/dynamic-form';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { DynamicFieldInput } from '@/components/form-renderer/DynamicFieldInput';
import { LocationProvider } from '@/components/form-renderer/location-context';
import { useDynamicForm } from '@/components/form-renderer/use-dynamic-form';

interface FormPreviewProps {
  /** Configuracao a desenhar: a do cadastro ou a do questionario. */
  config: ClientFormConfig;
  teamName: string;
  photo: string | null;
  /** Linha abaixo do nome do time. Diz o que a pessoa esta preenchendo. */
  subtitle?: string;
  submitLabel?: string;
}

/**
 * Pre-visualizacao fiel do formulario publico.
 *
 * Usa exatamente os mesmos componentes da pagina publica, e serve aos dois
 * construtores: o do cadastro e o do questionario. O que muda entre eles e
 * so a configuracao recebida e os rotulos.
 */
export function FormPreview({
  config,
  teamName,
  photo,
  subtitle = 'Cadastro de equipe',
  submitLabel = 'Enviar cadastro',
}: FormPreviewProps) {
  const form = useDynamicForm(config);
  const fields = visibleFields(config);
  const { privacy } = config;

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-xs text-ink-500">
        <Smartphone aria-hidden="true" className="size-4" />
        Prévia interativa. Nada é salvo aqui.
      </p>

      <div className="mx-auto w-full max-w-md rounded-card border border-line bg-surface-muted p-3 sm:p-4">
        <div className="rounded-control bg-surface p-4 shadow-card">
          <div className="flex items-center gap-3 border-b border-line pb-4">
            <Avatar name={teamName} src={photo} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{teamName}</p>
              <p className="truncate text-xs text-ink-500">{subtitle}</p>
            </div>
          </div>

          {config.introText ? (
            <p className="mt-4 text-sm whitespace-pre-line text-ink-700">{config.introText}</p>
          ) : null}

          <div className="mt-4 space-y-4">
            <LocationProvider fields={fields} values={form.values} setValue={form.setValue}>
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
            </LocationProvider>

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
              {submitLabel}
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
