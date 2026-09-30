'use client';

import { useState } from 'react';
import { Power, PowerOff } from 'lucide-react';
import type { Member } from '@/lib/types';
import { api } from '@/lib/repositories/http/api';
import { notifyDataChanged } from '@/lib/repositories';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/components/layout/SessionProvider';

/**
 * Desativar e reativar um Lider. So o ADMIN geral, e so em Lider com acesso
 * de verdade (quem so existe na planilha do Sheets nao tem conta).
 *
 * Desativar desliga a CONTA, e nada mais: o Lider para de entrar no painel e
 * o link de cadastro dele para de aceitar pessoas. Ninguem e apagado — a
 * Equipe dele continua na lista, com ele como responsavel, e reativar
 * devolve tudo como estava.
 */
export function DesativarLiderButton({ member }: { member: Member }) {
  const { can } = useSession();
  const toast = useToast();
  const [confirmando, setConfirmando] = useState(false);

  const temConta = Boolean(member.userId) && !member.userId!.startsWith('planilha-');
  if (!can('settings.manage') || member.tier !== 'LIDER' || member.fromSheet || !temConta) return null;

  const desativado = member.access === 'DISABLED';

  async function alternar() {
    try {
      await api(`/api/usuarios/${member.userId}`, {
        method: 'PATCH',
        body: { isActive: desativado },
      });
      toast.success(desativado ? `${member.name} foi reativado.` : `${member.name} foi desativado.`);
      notifyDataChanged();
    } catch (falha) {
      toast.error(falha instanceof Error ? falha.message : 'Não foi possível alterar o Líder.');
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <>
      <Button
        variant={desativado ? 'secondary' : 'ghost'}
        size="sm"
        onClick={() => setConfirmando(true)}
        className={desativado ? undefined : 'text-danger-600 hover:bg-danger-50'}
      >
        {desativado ? (
          <Power aria-hidden="true" className="size-4" />
        ) : (
          <PowerOff aria-hidden="true" className="size-4" />
        )}
        {desativado ? 'Reativar Líder' : 'Desativar Líder'}
      </Button>

      <ConfirmDialog
        open={confirmando}
        tone={desativado ? 'brand' : 'danger'}
        title={desativado ? 'Reativar Líder' : 'Desativar Líder'}
        description={
          desativado
            ? `${member.name} volta a entrar no painel, e o link de cadastro dele volta a funcionar.`
            : `${member.name} deixa de entrar no painel, e o link de cadastro dele para de aceitar pessoas.`
        }
        confirmLabel={desativado ? 'Reativar' : 'Desativar'}
        onCancel={() => setConfirmando(false)}
        onConfirm={alternar}
        details={
          desativado ? undefined : (
            <p className="rounded-control bg-ink-50 p-3 text-sm text-ink-700">
              Ninguém é apagado: a Equipe dele continua na lista, e reativar devolve tudo como estava.
            </p>
          )
        }
      />
    </>
  );
}
