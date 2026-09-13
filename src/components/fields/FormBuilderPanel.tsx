'use client';

import { useMemo, useState } from 'react';
import { ShieldCheck, Users } from 'lucide-react';
import type { Client, CustomField, FormAudience, Member } from '@/lib/types';
import { FORM_AUDIENCES, FORM_AUDIENCE_LABELS } from '@/lib/types';
import { clientRepository } from '@/lib/repositories';
import { applyAudience, countResponses, formForAudience } from '@/lib/domain/form-config';
import { cn } from '@/lib/utils/cn';
import { useToast } from '@/components/ui/Toast';
import { FieldsBuilder } from './FieldsBuilder';
import { FormPreview } from './FormPreview';
import { FormSettingsCard } from './FormSettingsCard';

interface FormBuilderPanelProps {
  client: Client;
  members: Member[];
}

/** Como cada link se apresenta na troca. */
const AUDIENCES: Record<FormAudience, { icon: typeof Users; hint: string }> = {
  CANDIDATE: {
    icon: ShieldCheck,
    hint: 'O link que o administrador do time copia e envia.',
  },
  EQUIPE: {
    icon: Users,
    hint: 'O link que cada integrante da equipe copia e envia adiante.',
  },
};

/**
 * Construtor dos formularios de cadastro do time.
 *
 * O time tem DOIS links de cadastro, e eles recrutam gente diferente: o do
 * Administrador do time, que ele mesmo envia, e o de cada integrante da
 * equipe, enviado adiante. Cada um tem o proprio formulario, e a troca aqui
 * em cima diz qual deles esta sendo editado.
 *
 * A LISTA DE CAMPOS E A MESMA nos dois. O que muda por link e o que cada um
 * pergunta: quais campos aparecem e quais sao obrigatorios. Um campo novo
 * criado aqui entra na lista dos dois, mas nasce ligado somente no link em
 * que foi criado — quem o adicionou estava montando um formulario so.
 *
 * Duplicar as listas criaria dois "CPF", dois "Nome completo", dois de cada,
 * e as respostas ja gravadas apontam para o identificador do campo: a ficha
 * de quem se cadastrou antes passaria a depender de qual copia sobreviveu.
 *
 * A lista, o arrastar e soltar, o editor de campo e a confirmacao de
 * exclusao vivem em `FieldsBuilder`, compartilhado com o questionario.
 */
export function FormBuilderPanel({ client, members }: FormBuilderPanelProps) {
  const toast = useToast();
  const [audience, setAudience] = useState<FormAudience>('CANDIDATE');

  // O formulario daquele link: `enabled` e `required` ja resolvidos para o
  // publico escolhido. Dali para baixo ninguem precisa saber que sao dois.
  const form = useMemo(() => formForAudience(client.form, audience), [client.form, audience]);
  const original = useMemo(
    () => new Map(client.form.fields.map((field) => [field.id, field])),
    [client.form.fields],
  );

  async function persist(next: CustomField[], message: string) {
    try {
      // Escreve de volta somente a decisao DESTE link: a do outro permanece
      // como estava. Sem isso, salvar em uma aba apagaria os ajustes da outra.
      const fields = next.map((field) => applyAudience(original.get(field.id), field, audience));
      await clientRepository.updateForm(client.id, { fields });
      toast.success(message);
    } catch {
      toast.error('Não foi possível salvar o formulário.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line bg-surface p-3 shadow-card sm:p-4">
        <p className="text-sm font-semibold text-ink-900">Qual link você está montando?</p>
        <p className="mt-0.5 text-[0.8125rem] text-ink-500">
          Os dois links usam a mesma lista de campos. O que muda é o que cada um pergunta.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {FORM_AUDIENCES.map((item) => {
            const { icon: Icon, hint } = AUDIENCES[item];
            const ativo = audience === item;
            const ativos = client.form.fields.filter((field) =>
              item === 'CANDIDATE' ? field.enabled : field.enabledEquipe,
            ).length;

            return (
              <button
                key={item}
                type="button"
                onClick={() => setAudience(item)}
                aria-pressed={ativo}
                className={cn(
                  'flex min-h-11 items-start gap-2.5 rounded-control border p-3 text-left transition-colors',
                  ativo
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-line bg-surface hover:bg-ink-50',
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn('mt-0.5 size-4 shrink-0', ativo ? 'text-brand-700' : 'text-ink-400')}
                />
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block text-sm font-semibold',
                      ativo ? 'text-brand-900' : 'text-ink-900',
                    )}
                  >
                    {FORM_AUDIENCE_LABELS[item]}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-500">{hint}</span>
                  <span className="mt-1 block text-xs font-medium text-ink-500 tabular-nums">
                    {ativos} {ativos === 1 ? 'campo ativo' : 'campos ativos'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <FieldsBuilder
        // Remonta ao trocar de link: a lista, a previa e o editor recomecam
        // do formulario daquele público, sem herdar nada do anterior.
        key={audience}
        fields={form.fields}
        onPersist={(next, message) => void persist(next, message)}
        countResponses={(fieldId) => countResponses(members, fieldId)}
        preview={
          <FormPreview
            config={form}
            teamName={client.name}
            photo={client.photo}
            subtitle={FORM_AUDIENCE_LABELS[audience]}
          />
        }
        settings={<FormSettingsCard client={client} />}
        texts={{
          noun: 'campo',
          nounPlural: 'campos',
          cardTitle: `Campos — ${FORM_AUDIENCE_LABELS[audience].toLowerCase()}`,
          cardDescription:
            'Desligue o que este link não deve pedir. Arraste para reordenar no computador ou use as setas no celular.',
          emptyTitle: 'Nenhum campo configurado',
          emptyDescription: 'Adicione os campos que a equipe deverá preencher.',
          removeDescription: (label) =>
            `O campo "${label}" será removido dos dois links de cadastro.`,
        }}
        removeDetails={(field) => {
          const respostas = countResponses(members, field.id);

          return (
            <div className="space-y-2">
              <p className="rounded-control bg-ink-50 p-3 text-sm text-ink-700">
                A lista de campos é a mesma nos dois links: excluir aqui tira o campo também do
                outro. Para pedir o campo em um só, desligue-o no outro em vez de excluir.
              </p>
              {respostas > 0 ? (
                <p className="rounded-control bg-warning-50 p-3 text-sm text-warning-600">
                  <strong>{respostas}</strong>{' '}
                  {respostas === 1 ? 'integrante já respondeu' : 'integrantes já responderam'} a
                  este campo. As respostas deixarão de ser exibidas nas fichas.
                </p>
              ) : null}
            </div>
          );
        }}
      />
    </div>
  );
}
