'use client';

/* eslint-disable @next/next/no-img-element */
import { Pencil, ShieldCheck } from 'lucide-react';
import type { ClientFormConfig } from '@/lib/types';
import {
  CONSENT_KEY,
  formatFilledValue,
  type DynamicFormValues,
} from '@/lib/validation/dynamic-form';
import { Checkbox } from '@/components/ui/Checkbox';
import type { InviteStep } from './invite-steps';

interface InviteReviewStepProps {
  config: ClientFormConfig;
  values: DynamicFormValues;
  /** Etapas de preenchimento, sem a revisao. */
  steps: InviteStep[];
  /** Volta para a etapa correspondente antes de confirmar. */
  onEditStep: (index: number) => void;
  consentError?: string;
  disabled: boolean;
  onConsentChange: (accepted: boolean) => void;
  /** Aviso curto sobre os sinais tecnicos registrados no envio. */
  deviceNotice: string;
}

/**
 * Revisao e confirmacao.
 *
 * Resumo do que foi preenchido, organizado pelas mesmas etapas do
 * formulario, com a volta para corrigir cada uma. Nada e salvo nem
 * consultado aqui: o envio acontece so depois da confirmacao final.
 */
export function InviteReviewStep({
  config,
  values,
  steps,
  onEditStep,
  consentError,
  disabled,
  onConsentChange,
  deviceNotice,
}: InviteReviewStepProps) {
  const { privacy } = config;

  return (
    <div className="space-y-3">
      {steps.map((step, index) => {
        const photo = step.fields.find((field) => field.type === 'photo');
        const photoValue = photo ? values[photo.id] : null;
        const rest = step.fields.filter((field) => field.type !== 'photo');

        return (
          <section
            key={step.id}
            aria-labelledby={`revisao-${step.id}`}
            className="overflow-hidden rounded-card border border-line bg-surface"
          >
            <div className="flex items-center justify-between gap-2 border-b border-line bg-ink-50 px-3.5 py-2.5">
              <h3
                id={`revisao-${step.id}`}
                className="min-w-0 truncate text-[0.8125rem] font-semibold text-ink-900"
              >
                {step.label}
              </h3>

              <button
                type="button"
                disabled={disabled}
                onClick={() => onEditStep(index)}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-xs font-semibold text-accent-600 transition-colors hover:text-accent-700 disabled:opacity-60"
              >
                <Pencil aria-hidden="true" className="size-3.5" />
                Editar
              </button>
            </div>

            <div className="px-3.5 py-1">
              {photo && typeof photoValue === 'string' && photoValue ? (
                <div className="flex items-center gap-3 border-b border-line py-3">
                  <img
                    src={photoValue}
                    alt="Foto enviada"
                    className="size-14 shrink-0 rounded-full border border-line object-cover"
                  />
                  <p className="text-sm font-medium text-ink-900">{photo.label}</p>
                </div>
              ) : null}

              <dl className="divide-y divide-line">
                {rest.map((field) => (
                  <div
                    key={field.id}
                    className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-3"
                  >
                    <dt className="text-xs text-ink-500 sm:w-2/5 sm:shrink-0">{field.label}</dt>
                    <dd className="text-sm font-medium break-words text-ink-900 sm:min-w-0 sm:flex-1">
                      {formatFilledValue(field, values[field.id])}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        );
      })}

      {privacy.enabled ? (
        <section
          aria-labelledby="aviso-privacidade"
          className="rounded-card border border-line bg-ink-50 p-3.5"
        >
          <h3
            id="aviso-privacidade"
            className="flex items-center gap-2 text-[0.8125rem] font-semibold text-ink-900"
          >
            <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-brand-700" />
            {privacy.title}
          </h3>
          <p className="mt-1.5 text-xs whitespace-pre-line text-ink-700">{privacy.text}</p>
          <p className="mt-1.5 text-xs text-ink-700">{deviceNotice}</p>

          {privacy.requireConsent ? (
            <>
              <Checkbox
                id="publico-consentimento"
                className="mt-1"
                label={privacy.consentLabel}
                checked={values[CONSENT_KEY] === true}
                disabled={disabled}
                aria-invalid={consentError ? true : undefined}
                onChange={(event) => onConsentChange(event.target.checked)}
              />
              {consentError ? (
                <p role="alert" className="text-xs font-medium text-danger-600">
                  {consentError}
                </p>
              ) : null}
            </>
          ) : null}
        </section>
      ) : (
        <p className="text-xs text-ink-500">{deviceNotice}</p>
      )}
    </div>
  );
}
