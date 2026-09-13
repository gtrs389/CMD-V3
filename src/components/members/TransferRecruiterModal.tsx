'use client';

import { useCallback, useState } from 'react';
import { ArrowRightLeft, ShieldCheck, Users } from 'lucide-react';
import type { Member } from '@/lib/types';
import { ROLE_LABELS } from '@/lib/permissions';
import { api } from '@/lib/repositories/http/api';
import { notifyDataChanged } from '@/lib/repositories';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';

interface RecruiterOption {
  userId: string;
  name: string;
  role: 'CANDIDATE' | 'EQUIPE';
}

interface TransferRecruiterModalProps {
  open: boolean;
  member: Member;
  onClose: () => void;
}

/**
 * Passa o cadastro de um responsavel para outro.
 *
 * Quem se cadastra por um link fica ligado ao dono daquele link, e esse
 * vinculo decide tres coisas: quem enxerga a pessoa, quem aparece em
 * "Cadastrado por" e de quem e o numero no ranking da equipe. Na pratica
 * isso precisa poder mudar — o responsavel saiu, dois trocaram de area, ou o
 * link simplesmente foi o errado.
 *
 * A lista vem do SERVIDOR e traz apenas quem pode receber: gente do proprio
 * time, ativa, e que de fato recruta. O ADMIN geral nao aparece — ele
 * administra o sistema, nao e ponta de uma hierarquia.
 *
 * Exclusivo do ADMIN geral: a rota exige `member.update`, que nenhum outro
 * perfil tem.
 */
export function TransferRecruiterModal({ open, member, onClose }: TransferRecruiterModalProps) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [escolhido, setEscolhido] = useState<string | null>(null);

  const loader = useCallback(
    () =>
      open
        ? api<{ recruiters: RecruiterOption[] }>(`/api/members/${member.id}/responsavel`)
        : Promise.resolve<{ recruiters: RecruiterOption[] } | null>(null),
    [open, member.id],
  );
  const { data, loading, error, reload } = useRepositoryQuery(loader);

  const atual = member.recruitedBy?.userId ?? null;
  const opcoes = (data?.recruiters ?? []).filter((item) => item.userId !== atual);

  async function transferir() {
    if (!escolhido || saving) return;
    setSaving(true);
    try {
      await api<{ member: Member }>(`/api/members/${member.id}/responsavel`, {
        method: 'PATCH',
        body: { userId: escolhido },
      });
      // A lista, a ficha e o ranking mudam juntos: todos leem o mesmo dado.
      notifyDataChanged();
      toast.success('Responsável alterado.');
      onClose();
    } catch (falha) {
      toast.error(
        falha instanceof Error && falha.message
          ? falha.message
          : 'Não foi possível alterar o responsável.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      size="md"
      title="Alterar responsável pelo cadastro"
      description={`${member.name} passa a contar para o responsável escolhido. A troca fica registrada na ficha.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void transferir()} loading={saving} disabled={!escolhido}>
            <ArrowRightLeft aria-hidden="true" className="size-4" />
            Alterar responsável
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="rounded-control bg-ink-50 p-3 text-sm text-ink-700">
          Hoje está com{' '}
          <strong className="text-ink-900">{member.recruitedBy?.name ?? 'ninguém'}</strong>. Quem
          receber passa a enxergar este cadastro e a contá-lo no próprio total.
        </p>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-control" />
            <Skeleton className="h-14 w-full rounded-control" />
          </div>
        ) : error ? (
          <div role="alert" className="space-y-2">
            <p className="text-sm text-danger-700">{error}</p>
            <Button variant="secondary" size="sm" onClick={reload}>
              Tentar novamente
            </Button>
          </div>
        ) : opcoes.length === 0 ? (
          <EmptyState
            compact
            icon={<Users className="size-5" />}
            title="Ninguém para receber"
            description="Este time não tem outra pessoa ativa que receba cadastros."
          />
        ) : (
          <ul className="space-y-1.5">
            {opcoes.map((opcao) => {
              const ativo = escolhido === opcao.userId;
              const Icon = opcao.role === 'CANDIDATE' ? ShieldCheck : Users;

              return (
                <li key={opcao.userId}>
                  <button
                    type="button"
                    onClick={() => setEscolhido(opcao.userId)}
                    aria-pressed={ativo}
                    disabled={saving}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-control border p-3 text-left transition-colors',
                      ativo
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-line bg-surface hover:bg-ink-50',
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className={cn('size-4 shrink-0', ativo ? 'text-brand-700' : 'text-ink-400')}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-900">
                        {opcao.name}
                      </span>
                      <span className="block text-xs text-ink-500">{ROLE_LABELS[opcao.role]}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
