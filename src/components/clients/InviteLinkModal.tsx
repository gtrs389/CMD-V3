'use client';

import type { Client } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { InvitePanel } from './InvitePanel';
import { InviteStatusPanel } from './InviteStatusPanel';

interface InviteLinkModalProps {
  open: boolean;
  client: Client;
  /** Sessao com `invite.manage`: ativa, desativa e renova o link. */
  canManage: boolean;
  onClose: () => void;
}

/**
 * Link de cadastro em dialogo, aberto pelo botao do cabecalho.
 *
 * O convite deixou de ser uma aba: quem administra abre daqui para copiar,
 * prever, ligar, desligar e renovar; quem so consulta ve a situacao e copia
 * o proprio endereco. As rotas continuam recusando o que o perfil nao pode.
 */
export function InviteLinkModal({ open, client, canManage, onClose }: InviteLinkModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={canManage ? 'Gerenciar link' : 'Meu link de cadastro'}
    >
      {canManage ? <InvitePanel client={client} /> : <InviteStatusPanel client={client} />}
    </Modal>
  );
}
