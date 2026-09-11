'use client';

import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Aviso central de carregamento enquanto os dados sao confirmados.
 *
 * Nunca revela que uma consulta externa esta acontecendo: so que a
 * informacao esta sendo confirmada. Sem botao de fechar: some sozinho assim
 * que a confirmacao termina.
 */
export function InviteVerifyingModal({ open }: { open: boolean }) {
  return (
    <Modal open={open} onClose={() => {}} busy title="Confirmando seus dados">
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <Spinner className="size-6 text-brand-700" />
        <p className="text-sm text-ink-500">
          Só um instante, estamos confirmando suas informações.
        </p>
      </div>
    </Modal>
  );
}
