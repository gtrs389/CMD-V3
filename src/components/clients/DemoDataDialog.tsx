'use client';

import { api } from '@/lib/repositories/http/api';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import type { Client } from '@/lib/types';

interface DemoRefreshReport {
  removed: number;
  people: number;
  places: number;
  points: { resolved: number; missing: number };
}

interface DemoDataDialogProps {
  open: boolean;
  client: Client | null;
  onCancel: () => void;
  onDone?: () => void;
}

/**
 * Corrige os dados gerados de um Time DEMO ja criado.
 *
 * Existe porque a primeira versao do gerador inventava escola, endereco e
 * coordenada — e punha marcador em outro estado e no mar. Esta acao troca
 * aquela geracao pela atual, com locais de votacao reais de Alagoas e
 * coordenadas obtidas pela consulta de endereco do proprio sistema.
 *
 * O aviso diz exatamente o que sai e o que fica, porque e disso que a pessoa
 * precisa para decidir: nenhum administrador, acesso, link ou configuracao e
 * tocado, e ninguem cadastrado a mao e removido.
 */
export function DemoDataDialog({ open, client, onCancel, onDone }: DemoDataDialogProps) {
  const toast = useToast();
  if (!client) return null;

  async function handleConfirm() {
    if (!client) return;
    try {
      const { report } = await api<{ report: DemoRefreshReport }>(
        `/api/clients/demo/${client.id}/dados`,
        { method: 'POST' },
      );

      toast.success(
        report.points.missing > 0
          ? `Dados refeitos: ${report.people} pessoas em ${report.places} locais. ` +
              `${report.points.missing} endereço(s) ficaram sem coordenada.`
          : `Dados refeitos: ${report.people} pessoas em ${report.places} locais de Alagoas.`,
      );
      onDone?.();
    } catch (falha) {
      toast.error(
        falha instanceof Error && falha.message
          ? falha.message
          : 'Não foi possível refazer os dados do Time DEMO.',
      );
    }
  }

  return (
    <ConfirmDialog
      open={open}
      tone="brand"
      title="Refazer dados de demonstração"
      description={`As pessoas fictícias de "${client.name}" são geradas de novo, com escolas e endereços reais de Alagoas.`}
      confirmLabel="Refazer dados"
      onCancel={onCancel}
      onConfirm={handleConfirm}
      details={
        <ul className="space-y-1.5 rounded-control bg-ink-50 p-3 text-sm text-ink-700">
          <li>Saem as pessoas fictícias da geração anterior, com os pinos errados.</li>
          <li>Entram pessoas fictícias em locais de votação reais de Alagoas.</li>
          <li>
            <strong className="text-ink-900">Não são tocados:</strong> o time, os
            administradores, os acessos deles, os links, o formulário e as configurações.
          </li>
          <li>Ninguém cadastrado à mão neste time é removido.</li>
        </ul>
      }
    />
  );
}
