'use client';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface InviteConfirmValueModalProps {
  open: boolean;
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirmacao de um unico numero (CPF ou título de eleitor) antes de seguir. */
export function InviteConfirmValueModal({
  open,
  title,
  description,
  onCancel,
  onConfirm,
}: InviteConfirmValueModalProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Corrigir
          </Button>
          <Button onClick={onConfirm}>Sim, está correto</Button>
        </>
      }
    >
      <p className="text-sm text-ink-700">{description}</p>
    </Modal>
  );
}
