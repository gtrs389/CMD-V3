'use client';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface InviteConfirmValueModalProps {
  open: boolean;
  /** O que esta sendo conferido: "CPF" ou "título de eleitor". */
  label: string;
  /** Numero ja formatado, do jeito que a pessoa digitou. */
  value: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmacao de um unico numero (CPF ou titulo de eleitor) antes de seguir.
 *
 * O numero e a unica coisa que importa nesta tela, entao ele aparece grande,
 * espacado e sozinho: a pessoa confere digito por digito sem precisar
 * procurar o valor no meio de uma frase.
 *
 * "Corrigir" vem primeiro de proposito. Errar um digito e comum, e voltar
 * para o campo precisa ser tao facil quanto seguir.
 */
export function InviteConfirmValueModal({
  open,
  label,
  value,
  onCancel,
  onConfirm,
}: InviteConfirmValueModalProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      chrome="plain"
      title={`Confira seu ${label}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} fullWidth>
            Corrigir
          </Button>
          <Button onClick={onConfirm} fullWidth>
            Está correto
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-center">
        <p className="text-sm text-ink-500">Você digitou</p>

        {/* O numero sozinho, grande e espacado: e ele que a pessoa precisa
            conferir, digito por digito. */}
        <p className="rounded-control border border-line bg-ink-50 px-3 py-4 font-mono text-xl font-bold tracking-[0.08em] break-all text-ink-900 tabular-nums sm:text-2xl">
          {value}
        </p>

        <p className="text-sm text-ink-700">
          Confira com calma. Um dígito errado impede a confirmação do cadastro.
        </p>
      </div>
    </Modal>
  );
}
