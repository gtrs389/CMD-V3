'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Send, UserPlus } from 'lucide-react';
import type { FieldValue } from '@/lib/types';
import { fetchOwnSurvey, submitOwnSurveyAnswer } from '@/lib/repositories';
import {
  answerableFields,
  buildSurveySections,
  identityFrom,
  toSurveyFormConfig,
} from '@/lib/domain/survey-config';
import { completionPercent, missingRequired } from '@/lib/validation/dynamic-form';
import { cn } from '@/lib/utils/cn';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useDynamicForm } from '@/components/form-renderer/use-dynamic-form';
import { PublicFormBody } from '@/components/public/PublicFormBody';
import { focusFirstInvalid } from '@/components/public/PublicFormShell';

interface SurveyAnswerModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Formulario 2 preenchido DENTRO do painel, pelo proprio lider.
 *
 * O lider envia o Formulario 2 por link; quando a pessoa esta na frente
 * dele, nao ha por que mandar endereco nenhum — ele anota ali. As perguntas
 * sao as MESMAS que o ADMIN geral montou, na mesma ordem, pela mesma
 * conversao que a previa do construtor e a tela publica usam. Ninguem
 * responde a um formulario diferente por ter sido atendido pessoalmente.
 *
 * O que fica gravado e uma resposta do Formulario 2 — mesma tabela, mesma
 * lista da aba "Formulário 2" —, e NAO um integrante: quem responde o
 * Formulario 2 nunca vira integrante nem recebe acesso ao painel, e
 * preencher a mao nao muda isso.
 */
export function SurveyAnswerModal({ open, onClose }: SurveyAnswerModalProps) {
  const toast = useToast();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [salvando, setSalvando] = useState(false);
  /** Quantos ja foram anotados sem fechar esta tela. */
  const [anotados, setAnotados] = useState(0);

  // So carrega quando abre: as perguntas podem ter mudado desde a ultima vez.
  const loader = useCallback(async () => {
    if (!open) return null;
    return fetchOwnSurvey();
  }, [open]);

  const { data, loading, error } = useRepositoryQuery(loader);
  const survey = data?.survey ?? null;

  const config = useMemo(
    () =>
      survey
        ? toSurveyFormConfig(survey)
        : { fields: [], privacy: { enabled: false, title: '', text: '', requireConsent: false, consentLabel: '' }, introText: '', successMessage: '', updatedAt: '' },
    [survey],
  );

  const form = useDynamicForm(config);
  const sections = useMemo(() => buildSurveySections(config), [config]);
  const percent = completionPercent(config, form.values);
  const faltam = missingRequired(config, form.values);

  const { reset } = form;

  /** Abriu a tela: a contagem recomeca. */
  const [estavaAberto, setEstavaAberto] = useState(open);
  if (open !== estavaAberto) {
    setEstavaAberto(open);
    if (open) {
      setAnotados(0);
      reset(undefined);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void salvar(false);
  }

  async function salvar(continuar: boolean) {
    if (salvando) return;

    const values = form.validate();
    if (!values) {
      toast.error('Revise os campos destacados.');
      window.requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }

    setSalvando(true);

    try {
      // Nome e telefone viajam a parte, como identificacao da resposta: eles
      // tem coluna propria e nao entram de novo entre as respostas.
      const { name, phone } = identityFrom(config, values);

      await submitOwnSurveyAnswer({
        name,
        phone,
        answers: answerableFields(config).map((field) => ({
          fieldId: field.id,
          value: (values[field.id] ?? null) as FieldValue,
        })),
      });

      if (continuar) {
        const total = anotados + 1;
        setAnotados(total);
        reset(undefined);
        toast.success(
          total === 1
            ? 'Resposta registrada. Pode preencher a próxima.'
            : `${total} respostas registradas. Pode preencher a próxima.`,
        );
        window.requestAnimationFrame(() => formRef.current?.scrollIntoView({ block: 'start' }));
        return;
      }

      toast.success('Resposta registrada.');
      onClose();
    } catch (falha) {
      toast.error(
        falha instanceof Error && falha.message
          ? falha.message
          : 'Não foi possível registrar a resposta.',
      );
    } finally {
      setSalvando(false);
    }
  }

  const semPerguntas = !loading && !error && config.fields.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Adicionar pelo Formulário 2"
      description="As mesmas perguntas do link que você envia, preenchidas por você."
      footer={
        <>
          <p
            aria-live="polite"
            className={cn(
              'order-last flex-1 text-center text-xs font-medium sm:order-first sm:text-left',
              faltam === 0 ? 'text-success-600' : 'text-ink-500',
            )}
          >
            {anotados > 0 && faltam > 0 && percent === 0
              ? `${anotados} ${anotados === 1 ? 'registrada' : 'registradas'} nesta tela. Preencha a próxima.`
              : faltam === 0
                ? 'Tudo pronto para salvar.'
                : `Ainda ${faltam === 1 ? 'falta' : 'faltam'} ${faltam} ${
                    faltam === 1 ? 'campo obrigatório' : 'campos obrigatórios'
                  }.`}
          </p>

          <Button variant="secondary" onClick={onClose} disabled={salvando}>
            {anotados > 0 ? 'Concluir' : 'Cancelar'}
          </Button>

          {!semPerguntas ? (
            <>
              <Button
                variant="secondary"
                onClick={() => void salvar(true)}
                loading={salvando}
                disabled={salvando || loading}
              >
                {!salvando ? <UserPlus aria-hidden="true" className="size-4" /> : null}
                Salvar e adicionar outro
              </Button>

              <Button
                type="submit"
                form="questionario-painel"
                variant="accent"
                loading={salvando}
                disabled={salvando || loading}
              >
                {!salvando ? <Send aria-hidden="true" className="size-4" /> : null}
                Salvar
              </Button>
            </>
          ) : null}
        </>
      }
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error ? (
        <p className="rounded-control border border-line bg-ink-50 p-3 text-sm text-ink-500">
          Não foi possível carregar o Formulário 2.
        </p>
      ) : semPerguntas ? (
        <p className="rounded-control border border-line bg-ink-50 p-3 text-sm text-ink-500">
          O Formulário 2 ainda não tem perguntas. Quem monta é o administrador do sistema.
        </p>
      ) : (
        <PublicFormBody
          config={config}
          form={form}
          sections={sections}
          formId="questionario-painel"
          idPrefix="questionario-manual"
          submitting={salvando}
          onSubmit={handleSubmit}
          formRef={formRef}
          allowCamera
          sequential={false}
          onImageError={(message) => toast.error(message)}
        />
      )}
    </Modal>
  );
}
