'use client';

import type { Client, CustomField, Member } from '@/lib/types';
import { clientRepository } from '@/lib/repositories';
import { countResponses } from '@/lib/domain/form-config';
import { useToast } from '@/components/ui/Toast';
import { FieldsBuilder } from './FieldsBuilder';
import { FormPreview } from './FormPreview';
import { FormSettingsCard } from './FormSettingsCard';

interface FormBuilderPanelProps {
  client: Client;
  members: Member[];
}

/**
 * Construtor do formulario de cadastro do time.
 *
 * A lista, o arrastar e soltar, o editor de campo e a confirmacao de
 * exclusao vivem em `FieldsBuilder`, compartilhado com o questionario: sao
 * exatamente os mesmos comportamentos, em uma implementacao so. Aqui ficam
 * apenas as partes proprias do cadastro — de onde vem a lista, como ela e
 * gravada, a previa e os ajustes.
 */
export function FormBuilderPanel({ client, members }: FormBuilderPanelProps) {
  const toast = useToast();

  async function persist(next: CustomField[], message: string) {
    try {
      await clientRepository.updateForm(client.id, { fields: next });
      toast.success(message);
    } catch {
      toast.error('Não foi possível salvar o formulário.');
    }
  }

  return (
    <FieldsBuilder
      fields={client.form.fields}
      onPersist={(next, message) => void persist(next, message)}
      countResponses={(fieldId) => countResponses(members, fieldId)}
      preview={<FormPreview config={client.form} teamName={client.name} photo={client.photo} />}
      settings={<FormSettingsCard client={client} />}
      texts={{
        noun: 'campo',
        nounPlural: 'campos',
        cardTitle: 'Campos do formulário',
        cardDescription: 'Arraste para reordenar no computador ou use as setas no celular.',
        emptyTitle: 'Nenhum campo configurado',
        emptyDescription: 'Adicione os campos que a equipe deverá preencher.',
        removeDescription: (label) =>
          `O campo "${label}" será removido do formulário público.`,
      }}
      removeDetails={(field) => {
        const respostas = countResponses(members, field.id);

        return respostas > 0 ? (
          <p className="rounded-control bg-warning-50 p-3 text-sm text-warning-600">
            <strong>{respostas}</strong>{' '}
            {respostas === 1 ? 'integrante já respondeu' : 'integrantes já responderam'} a este
            campo. As respostas deixarão de ser exibidas nas fichas.
          </p>
        ) : (
          <p className="rounded-control bg-ink-50 p-3 text-sm text-ink-700">
            Nenhum integrante respondeu a este campo até agora.
          </p>
        );
      }}
    />
  );
}
