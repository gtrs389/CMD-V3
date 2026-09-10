'use client';

import { useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  /** Detalhamento do impacto (ex.: quantos registros serao removidos). */
  details?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'brand';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/** Confirmacao explicita antes de qualquer acao destrutiva. */
export function ConfirmDialog({
  open,
  title,
  description,
  details,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [working, setWorking] = useState(false);

  async function handleConfirm() {
    setWorking(true);
    try {
      await onConfirm();
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      busy={working}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={working}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={handleConfirm}
            loading={working}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span
          aria-hidden="true"
          className={
            tone === 'danger'
              ? 'flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-50 text-danger-600'
              : 'flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700'
          }
        >
          <AlertTriangle className="size-5" />
        </span>

        <div className="min-w-0 space-y-3">
          {description ? <p className="text-sm text-ink-700">{description}</p> : null}
          {details}
        </div>
      </div>
    </Modal>
  );
}
