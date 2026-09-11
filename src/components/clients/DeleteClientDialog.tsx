'use client';

import { clientRepository } from '@/lib/repositories';
import type { Client, CustomField } from '@/lib/types';
import { pluralize } from '@/lib/utils/text';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';

interface DeleteClientDialogProps {
  open: boolean;
  client: Client | null;
  memberCount: number;
  onCancel: () => void;
  onDeleted?: () => void;
}

function countCustomFields(fields: CustomField[]): number {
  return fields.filter((field) => field.systemKey === null).length;
}

/** Exclusao de candidato com detalhamento do impacto antes de confirmar. */
export function DeleteClientDialog({
  open,
  client,
  memberCount,
  onCancel,
  onDeleted,
}: DeleteClientDialogProps) {
  const toast = useToast();
  if (!client) return null;

  const customFields = countCustomFields(client.form.fields);

  async function handleConfirm() {
    if (!client) return;
    try {
      // Integrantes, respostas, campos e convite saem junto: o banco remove
      // tudo em cascata e o servidor apaga as fotos do Storage privado.
      await clientRepository.remove(client.id);
      toast.success(`Candidato "${client.name}" excluido.`);
      onDeleted?.();
    } catch {
      toast.error('Não foi possível excluir o candidato.');
    }
  }

  return (
    <ConfirmDialog
      open={open}
      title="Excluir candidato"
      description={`Esta ação remove definitivamente "${client.name}" e tudo o que está vinculado a ele. Não é possível desfazer.`}
      confirmLabel="Excluir definitivamente"
      onCancel={onCancel}
      onConfirm={handleConfirm}
      details={
        <ul className="space-y-1.5 rounded-control bg-ink-50 p-3 text-sm text-ink-700">
          <li className="flex justify-between gap-3">
            <span>Integrantes cadastrados</span>
            <strong className="text-ink-900">{memberCount}</strong>
          </li>
          <li className="flex justify-between gap-3">
            <span>{pluralize(customFields, 'Campo personalizado', 'Campos personalizados')}</span>
            <strong className="text-ink-900">{customFields}</strong>
          </li>
          <li className="flex justify-between gap-3">
            <span>Link de convite</span>
            <strong className="text-ink-900">1</strong>
          </li>
        </ul>
      }
    />
  );
}
