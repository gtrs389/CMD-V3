'use client';

import { useState } from 'react';
import { ClipboardList, FileText } from 'lucide-react';
import type { Client, Member } from '@/lib/types';
import { cn } from '@/lib/utils/cn';
import { FormBuilderPanel } from './FormBuilderPanel';
import { SurveyPanel } from '@/components/survey/SurveyPanel';

interface FormsPanelProps {
  client: Client;
  members: Member[];
}

type Qual = 'form1' | 'form2';

/**
 * Os dois formularios do time, configurados no mesmo lugar.
 *
 * Eles servem a etapas diferentes da mobilizacao, e por isso sao formularios
 * SEPARADOS — campos, ordem, obrigatoriedade, titulo, textos, interruptor e
 * link, cada um o seu. Mexer em um nao toca no outro.
 *
 *   Formulario 1  o administrador do time copia o link e envia para quem
 *                 sera lider. Quem preenche vira integrante e RECEBE acesso
 *                 ao painel.
 *   Formulario 2  o lider, ja dentro do painel, copia o link e envia para
 *                 outras pessoas. Quem preenche NAO recebe acesso, nao vira
 *                 integrante e nao ganha link proprio.
 *
 * Quem configura os dois e o mesmo ADMIN geral. O lider nao edita nada: ele
 * apenas envia o link do Formulario 2.
 */
export function FormsPanel({ client, members }: FormsPanelProps) {
  const [qual, setQual] = useState<Qual>('form1');

  const opcoes: { id: Qual; label: string; icon: typeof FileText; hint: string }[] = [
    {
      id: 'form1',
      label: 'Formulário 1',
      icon: FileText,
      hint: 'O administrador do time envia. Quem preenche recebe acesso ao painel.',
    },
    {
      id: 'form2',
      label: 'Formulário 2',
      icon: ClipboardList,
      hint: 'O líder envia. Quem preenche não recebe acesso ao painel.',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line bg-surface p-3 shadow-card sm:p-4">
        <p className="text-sm font-semibold text-ink-900">Qual formulário você está configurando?</p>
        <p className="mt-0.5 text-[0.8125rem] text-ink-500">
          São dois formulários separados: campos, textos e link próprios. Editar um não altera o
          outro.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {opcoes.map((opcao) => {
            const ativo = qual === opcao.id;

            return (
              <button
                key={opcao.id}
                type="button"
                onClick={() => setQual(opcao.id)}
                aria-pressed={ativo}
                className={cn(
                  'flex min-h-11 items-start gap-2.5 rounded-control border p-3 text-left transition-colors',
                  ativo ? 'border-brand-500 bg-brand-50' : 'border-line bg-surface hover:bg-ink-50',
                )}
              >
                <opcao.icon
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
                    {opcao.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-500">{opcao.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {qual === 'form1' ? (
        <FormBuilderPanel client={client} members={members} />
      ) : (
        // Aqui o ADMIN CONFIGURA. Quem envia o link do Formulario 2 e o
        // lider, no painel dele: um botao de gerar nesta tela seria um
        // segundo lugar de onde sair o mesmo link, para quem nao o envia.
        <SurveyPanel
          clientId={client.id}
          canManage
          showGenerate={false}
          registrationFields={client.form.fields}
          teamName={client.name}
          teamPhoto={client.photo}
        />
      )}
    </div>
  );
}
