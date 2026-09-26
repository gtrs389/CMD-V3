'use client';

import { useState } from 'react';
import { Eye } from 'lucide-react';
import type { Member } from '@/lib/types';
import { api } from '@/lib/repositories/http/api';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/components/layout/SessionProvider';

interface InspectMemberButtonProps {
  member: Member;
}

/**
 * Entrar no painel do integrante.
 *
 * A confirmacao nao e formalidade: a sessao aberta e DE VERDADE, e o que
 * for feito nela fica no nome da pessoa — em "Cadastrado por", no dono de
 * cada link gerado, no historico. Quem clica precisa saber disso antes, e
 * nao depois.
 *
 * O painel abre em outra aba, no endereco `painel.`: a sessao do ADMIN
 * continua intacta na aba de origem. Cada visita fica registrada.
 */
export function InspectMemberButton({ member }: InspectMemberButtonProps) {
  const { can } = useSession();
  const toast = useToast();
  const [confirmando, setConfirmando] = useState(false);

  // Sem acesso ATIVO nao ha painel para abrir: o integrante sem telefone
  // inteiro ainda nao e usuario do sistema, e o desativado nao entra nem
  // por conta propria.
  if (!can('session.impersonate') || !member.userId || member.access !== 'ACTIVE') return null;

  async function entrar() {
    try {
      const { url } = await api<{ url: string; name: string }>(
        `/api/usuarios/${member.userId}/inspecionar`,
        { method: 'POST' },
      );

      // O endereco vale uma vez e por poucos minutos: quem o abre e esta
      // aba, na hora.
      window.open(url, '_blank', 'noopener,noreferrer');
      setConfirmando(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível abrir o painel.');
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setConfirmando(true)}>
        <Eye aria-hidden="true" className="size-4" />
        Entrar no painel
      </Button>

      <ConfirmDialog
        open={confirmando}
        title={`Entrar no painel de ${member.name}?`}
        description={
          'Você vai usar o sistema como esta pessoa: o que for feito na sessão fica ' +
          'gravado no nome dela, inclusive os cadastros e os links gerados. A visita ' +
          'fica registrada, e sair não desconecta o celular dela. O painel abre em ' +
          'outra aba.'
        }
        confirmLabel="Entrar no painel"
        tone="brand"
        onConfirm={entrar}
        onCancel={() => setConfirmando(false)}
      />
    </>
  );
}
