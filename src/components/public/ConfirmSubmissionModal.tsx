'use client';

import { AlertTriangle } from 'lucide-react';
import type { ClientFormConfig } from '@/lib/types';
import {
  CONFIRMATION_NOTICE,
  CONFIRMATION_TITLE,
  CONFIRMATION_VERSION,
} from '@/lib/domain/confirmation';
import {
  formatFilledValue,
  visibleFields,
  type DynamicFormValues,
} from '@/lib/validation/dynamic-form';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface ConfirmSubmissionModalProps {
  open: boolean;
  config: ClientFormConfig;
  values: DynamicFormValues;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Conferencia final antes do envio.
 *
 * Nada e salvo nem consultado enquanto este dialogo esta aberto: o formulario
 * ja foi validado, mas o envio so acontece na confirmacao.
 */
export function ConfirmSubmissionModal({
  open,
  config,
  values,
  submitting,
  onCancel,
  onConfirm,
}: ConfirmSubmissionModalProps) {
  const fields = visibleFields(config);
  const photo = fields.find((field) => field.type === 'photo');
  const photoValue = photo ? values[photo.id] : null;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      busy={submitting}
      title={CONFIRMATION_TITLE}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            Voltar e corrigir
          </Button>
          <Button onClick={onConfirm} loading={submitting}>
            Confirmar cadastro
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div
          role="alert"
          className="flex gap-2.5 rounded-control border border-warning-50 bg-warning-50 p-3"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-600" />
          <p className="text-sm text-ink-900">{CONFIRMATION_NOTICE}</p>
        </div>

        {photo && typeof photoValue === 'string' && photoValue ? (
          <div className="flex justify-center">
            {/* URL local da propria escolha da pessoa: sem otimizador. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoValue}
              alt="Foto enviada"
              className="size-24 rounded-full border border-line object-cover"
            />
          </div>
        ) : null}

        <dl className="divide-y divide-line rounded-control border border-line">
          {fields
            .filter((field) => field.type !== 'photo')
            .map((field) => (
              <div key={field.id} className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:gap-3">
                <dt className="text-xs text-ink-500 sm:w-2/5 sm:text-sm">{field.label}</dt>
                <dd className="text-sm font-medium break-words text-ink-900 sm:flex-1">
                  {formatFilledValue(field, values[field.id])}
                </dd>
              </div>
            ))}
        </dl>

        <p className="text-[0.6875rem] text-ink-500">Aviso versão {CONFIRMATION_VERSION}</p>
      </div>
    </Modal>
  );
}
