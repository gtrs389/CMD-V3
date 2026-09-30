'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy } from 'lucide-react';
import type { Client } from '@/lib/types';
import { api } from '@/lib/repositories/http/api';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

interface DuplicateReport {
  client: Client;
  admins: number;
  leaders: number;
  leadersWithoutAccess: number;
}

interface DuplicateTeamDialogProps {
  open: boolean;
  client: Client;
  onClose: () => void;
}

/**
 * Duplicar um time (migration 049). So o ADMIN geral ve.
 *
 * O aviso diz exatamente o que vai e o que fica, porque e disso que a pessoa
 * precisa para decidir: a Equipe dos Lideres fica no oficial, e o oficial
 * nao e tocado. Terminada a copia, a tela abre o time novo.
 */
export function DuplicateTeamDialog({ open, client, onClose }: DuplicateTeamDialogProps) {
  const router = useRouter();
  const toast = useToast();
  const [nome, setNome] = useState('');
  const [duplicando, setDuplicando] = useState(false);

  const sugestao = `${client.name} (duplicado)`;

  function fechar() {
    if (duplicando) return;
    setNome('');
    onClose();
  }

  async function duplicar() {
    if (duplicando) return;
    setDuplicando(true);
    try {
      const { report } = await api<{ report: DuplicateReport }>(
        `/api/clients/${client.id}/duplicar`,
        { method: 'POST', body: { name: nome.trim() } },
      );

      toast.success(
        `Time duplicado: ${report.admins} ${report.admins === 1 ? 'administrador' : 'administradores'} e ` +
          `${report.leaders} ${report.leaders === 1 ? 'Líder' : 'Líderes'}.` +
          (report.leadersWithoutAccess > 0
            ? ` ${report.leadersWithoutAccess} sem acesso na cópia (telefone incompleto ou repetido).`
            : ''),
      );
      setNome('');
      onClose();
      router.push(`/candidatos/${report.client.id}`);
    } catch (falha) {
      toast.error(
        falha instanceof Error && falha.message
          ? falha.message
          : 'Não foi possível duplicar o time.',
      );
    } finally {
      setDuplicando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Duplicar time"
      description={`Cria uma cópia de "${client.name}" para ensaiar e mostrar, sem mexer no oficial.`}
      size="sm"
      busy={duplicando}
      footer={
        <>
          <Button variant="secondary" onClick={fechar} disabled={duplicando} fullWidth>
            Cancelar
          </Button>
          <Button onClick={duplicar} loading={duplicando} fullWidth>
            <Copy aria-hidden="true" className="size-4" />
            Duplicar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field id="nome-da-copia" label="Nome da cópia" help={`Em branco: "${sugestao}".`}>
          <Input
            id="nome-da-copia"
            value={nome}
            maxLength={120}
            placeholder={sugestao}
            onChange={(event) => setNome(event.target.value)}
            disabled={duplicando}
          />
        </Field>

        <ul className="space-y-1.5 rounded-control bg-ink-50 p-3 text-sm text-ink-700">
          <li>
            <strong className="text-ink-900">Vão para a cópia:</strong> os administradores do
            time, os Líderes, os formulários e as configurações.
          </li>
          <li>
            <strong className="text-ink-900">Ficam só no oficial:</strong> a Equipe de cada
            Líder, os links gerados e o histórico.
          </li>
          <li>
            O oficial <strong className="text-ink-900">não é alterado nem perde nada</strong>, e
            nada feito na cópia chega nele.
          </li>
          <li>
            A cópia fica fora da Visão geral e aparece em Times com o selo “Duplicado”. Nela,
            a planilha dos Líderes sobe normalmente.
          </li>
        </ul>
      </div>
    </Modal>
  );
}
