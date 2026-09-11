'use client';

import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Aviso central de carregamento, sem nenhum texto sobre o que esta
 * acontecendo por tras: so a animacao, igual a qualquer outro carregamento
 * do sistema. Nunca da a entender que uma consulta externa esta rolando.
 * Sem botao de fechar: some sozinho assim que termina.
 */
export function InviteVerifyingModal({ open }: { open: boolean }) {
  return (
    <Modal open={open} onClose={() => {}} busy title="Só um instante">
      <div className="flex justify-center py-4">
        <Spinner className="size-6 text-brand-700" />
      </div>
    </Modal>
  );
}
