'use client';

import type { Client, CustomField, Member } from '@/lib/types';
import { clientRepository } from '@/lib/repositories';
import { countResponses, withVerificationRules } from '@/lib/domain/form-config';
import { useToast } from '@/components/ui/Toast';
import { FieldsBuilder } from './FieldsBuilder';
import { FormPreview } from './FormPreview';
import { FormSettingsCard } from './FormSettingsCard';
import { VerificationCard } from './VerificationCard';

interface FormBuilderPanelProps {
  client: Client;
  members: Member[];
  /** Recarrega o time: a prévia acompanha a confirmação ligada ou desligada. */
  onChanged?: () => void;
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
export function FormBuilderPanel({ client, members, onChanged }: FormBuilderPanelProps) {
  const toast = useToast();

  // A previa mostra o formulario COMO ELE VALE hoje neste time: com a
  // confirmacao desligada, zona e secao aparecem ligadas e obrigatorias, do
  // mesmo jeito que quem abrir o link vai ver. A configuracao gravada nao e
  // tocada — a regra e derivada aqui, como no formulario publico.
  const previa = withVerificationRules(client.form, client.verificationEnabled);

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
      preview={<FormPreview config={previa} teamName={client.name} photo={client.photo} />}
      settings={
        <div className="space-y-4">
          <VerificationCard client={client} onChanged={onChanged} />
          <FormSettingsCard client={client} />
        </div>
      }
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
