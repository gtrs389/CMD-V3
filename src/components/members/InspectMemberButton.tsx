'use client';

import { useState } from 'react';
import { Eye, Pencil, PhoneOff } from 'lucide-react';
import type { Member } from '@/lib/types';
import { api } from '@/lib/repositories/http/api';
import { notifyDataChanged } from '@/lib/repositories/events';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/components/layout/SessionProvider';
import { useNavegador } from './navegador-contexto';

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
 * O botao existia so para quem tinha acesso ATIVO, e sumia sem explicacao
 * dos outros — Lideres cadastrados sem acesso ficavam sem botao. Agora ele
 * aparece para todos, e o servidor (`/api/members/[id]/painel`) resolve:
 * sem acesso ainda, o acesso nasce na hora; desligado, e religado. Quando
 * nao da — celular incompleto ou que ja e de outra pessoa do time — a ficha
 * diz por que, com o atalho para corrigir.
 *
 * O painel abre em outra aba, no endereco `painel.`: a sessao do ADMIN
 * continua intacta na aba de origem. Cada visita fica registrada.
 */
export function InspectMemberButton({ member }: InspectMemberButtonProps) {
  const { can } = useSession();
  const toast = useToast();
  const navegador = useNavegador();
  const [confirmando, setConfirmando] = useState(false);

  if (!can('session.impersonate') || member.access === 'DEMO_NO_ACCESS') return null;

  // Sem celular que sirva de entrada: nao ha painel para liberar. Em vez de
  // sumir, o botao diz o que falta e leva a correcao.
  const bloqueio =
    !member.userId && member.access === 'NO_PHONE'
      ? 'Sem celular completo no cadastro, esta pessoa ainda não tem painel.'
      : member.access === 'DUPLICATE_PHONE'
        ? 'O telefone desta pessoa já é o acesso de outra pessoa do time.'
        : null;

  if (bloqueio) {
    return (
      <div className="flex flex-col gap-2 rounded-control border border-warning-600/25 bg-warning-50/70 p-3 text-sm text-ink-700 sm:flex-row sm:items-center">
        <PhoneOff aria-hidden="true" className="size-4 shrink-0 text-warning-600" />
        <span className="min-w-0 flex-1">
          {bloqueio} Corrija o telefone e o painel é liberado na hora.
        </span>
        {navegador && can('member.update') ? (
          <Button variant="secondary" size="sm" onClick={() => navegador.editar(member.id)}>
            <Pencil aria-hidden="true" className="size-4" />
            Corrigir telefone
          </Button>
        ) : null}
      </div>
    );
  }

  // Ainda sem acesso (ou desligado): o mesmo clique libera e entra.
  const liberar = !member.userId || member.access === 'DISABLED';
  const rotulo = !member.userId
    ? 'Liberar acesso e entrar'
    : member.access === 'DISABLED'
      ? 'Religar acesso e entrar'
      : 'Entrar no painel';

  async function entrar() {
    try {
      const { url } = await api<{ url: string; name: string }>(`/api/members/${member.id}/painel`, {
        method: 'POST',
      });

      // O endereco vale uma vez e por poucos minutos: quem o abre e esta
      // aba, na hora.
      window.open(url, '_blank', 'noopener,noreferrer');
      setConfirmando(false);
      // O acesso acabou de nascer ou de ser religado: a ficha e a lista
      // passam a dizer "Ativo".
      if (liberar) notifyDataChanged();
    } catch (error) {
      setConfirmando(false);
      toast.error(error instanceof Error ? error.message : 'Não foi possível abrir o painel.');
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setConfirmando(true)}>
        <Eye aria-hidden="true" className="size-4" />
        {rotulo}
      </Button>

      <ConfirmDialog
        open={confirmando}
        title={`Entrar no painel de ${member.name}?`}
        description={
          (liberar
            ? !member.userId
              ? 'Esta pessoa ainda não tinha acesso: ele é liberado agora, pelo telefone do cadastro, e ela também passa a entrar pelo link do time. '
              : 'O acesso desta pessoa estava desligado e é religado agora. '
            : '') +
          'Você vai usar o sistema como esta pessoa: o que for feito na sessão fica ' +
          'gravado no nome dela, inclusive os cadastros e os links gerados. A visita ' +
          'fica registrada, e sair não desconecta o celular dela. O painel abre em ' +
          'outra aba.'
        }
        confirmLabel={rotulo}
        tone="brand"
        onConfirm={entrar}
        onCancel={() => setConfirmando(false)}
      />
    </>
  );
}
