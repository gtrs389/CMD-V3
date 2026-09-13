'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Link2Off, Send, WifiOff } from 'lucide-react';
import type { FieldValue, PublicSurvey } from '@/lib/types';
import { fetchPublicSurvey, submitSurvey, type PublicSurveyOutcome } from '@/lib/repositories';
import { GoneError, NetworkError } from '@/lib/repositories/http/api';
import { RepositoryError } from '@/lib/repositories/types';
import {
  answerableFields,
  buildSurveySections,
  identityFrom,
  toSurveyFormConfig,
} from '@/lib/domain/survey-config';
import { completionPercent, missingRequired } from '@/lib/validation/dynamic-form';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useDynamicForm } from '@/components/form-renderer/use-dynamic-form';
import { InviteStateShell } from './InviteChrome';
import { PublicFormBody } from './PublicFormBody';
import { PublicFormShell, PublicSuccessScreen, focusFirstInvalid } from './PublicFormShell';

/**
 * Questionario publico.
 *
 * E o SEGUNDO formulario do sistema, e nao se confunde com o de cadastro:
 * quem responde aqui NAO vira integrante, nao ganha acesso ao painel e nao
 * entra em contagem nenhuma de mobilizacao. A resposta fica guardada a
 * parte, com o nome e o telefone informados.
 *
 * Visualmente, porem, e a MESMA tela: a moldura, os cartoes, a barra de
 * avanco e o rodape fixo sao os componentes compartilhados do cadastro. Nao
 * existe um segundo padrao.
 *
 * A tela nao recebe nem conhece o codigo do link: ele ficou no cookie
 * `HttpOnly` que a rota de entrada gravou, e toda leitura ou envio o resolve
 * no servidor.
 */

export function PublicSurveyView() {
  const [outcome, setOutcome] = useState<PublicSurveyOutcome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  /**
   * Uma leitura por tentativa.
   *
   * O link e resolvido pelo cookie, que nao muda enquanto a tela existe:
   * nao ha nada para observar, so a primeira carga e o "tentar novamente".
   * O estado e escrito na resposta da promessa, nunca no corpo do efeito.
   */
  useEffect(() => {
    let ativo = true;

    fetchPublicSurvey()
      .then((resultado) => {
        if (!ativo) return;
        setOutcome(resultado);
        setError(null);
        setLoading(false);
      })
      .catch((falha: unknown) => {
        if (!ativo) return;
        setError(
          falha instanceof NetworkError
            ? falha.message
            : 'Não foi possível carregar o Formulário 2.',
        );
        setLoading(false);
      });

    return () => {
      ativo = false;
    };
  }, [attempt]);

  function retry() {
    setLoading(true);
    setError(null);
    setAttempt((valor) => valor + 1);
  }

  if (loading) {
    return (
      <InviteStateShell>
        <span className="mx-auto flex flex-col items-center gap-3 text-ink-500">
          <Spinner className="size-6 text-brand-700" />
          <p className="text-sm">Carregando formulário...</p>
        </span>
      </InviteStateShell>
    );
  }

  // Falha de rede nao pode ser confundida com link encerrado.
  if (error) {
    return (
      <InviteStateShell>
        <StateIcon tone="danger">
          <WifiOff className="size-6" />
        </StateIcon>
        <h1 className="text-lg font-semibold text-ink-900">Não foi possível carregar</h1>
        <p className="mt-2 text-sm text-balance text-ink-500">{error}</p>
        <Button variant="secondary" fullWidth className="mt-6" onClick={retry}>
          Tentar novamente
        </Button>
      </InviteStateShell>
    );
  }

  if (!outcome || outcome.kind === 'gone') return <SurveyClosed />;
  if (outcome.kind === 'unavailable') return <SurveyUnavailable />;

  return <SurveyForm survey={outcome.survey} />;
}

/* -------------------------------------------------------------------------
   Telas de estado
   ------------------------------------------------------------------------- */

function StateIcon({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'danger' | 'success';
  children: React.ReactNode;
}) {
  const cores =
    tone === 'danger'
      ? 'bg-danger-50 text-danger-600'
      : tone === 'success'
        ? 'bg-success-50 text-success-600'
        : 'bg-ink-100 text-ink-500';

  return (
    <span
      aria-hidden="true"
      className={`mx-auto mb-4 flex size-12 items-center justify-center rounded-full ${cores}`}
    >
      {children}
    </span>
  );
}

/** Encerrado, ja respondido ou reservado por outro aparelho: mesma tela. */
export function SurveyClosed() {
  return (
    <InviteStateShell>
      <StateIcon>
        <Clock className="size-6" />
      </StateIcon>
      <h1 className="text-lg font-semibold text-ink-900">Formulário encerrado</h1>
      <p className="mt-2 text-sm text-balance text-ink-500">
        Este link não está mais disponível. Solicite um novo link à pessoa que o enviou.
      </p>
    </InviteStateShell>
  );
}

export function SurveyUnavailable() {
  return (
    <InviteStateShell>
      <StateIcon>
        <Link2Off className="size-6" />
      </StateIcon>
      <h1 className="text-lg font-semibold text-ink-900">Formulário indisponível</h1>
      <p className="mt-2 text-sm text-balance text-ink-500">
        Este formulário não está ativo no momento. Fale com a pessoa que enviou o link.
      </p>
    </InviteStateShell>
  );
}

/* -------------------------------------------------------------------------
   Formulario
   ------------------------------------------------------------------------- */

/**
 * O questionario, desenhado pela MESMA moldura do cadastro.
 *
 * Cabecalho, banner do celular, largura, barra de avanco, cartoes numerados,
 * campos, mensagens de erro, alvos de toque, rodape fixo e tela final saem
 * de `PublicFormShell` e de `PublicFormSection` — os mesmos componentes que
 * a tela de cadastro usa. Nao ha uma segunda versao de nada: corrigir la
 * corrige aqui.
 *
 * O que e proprio do questionario e o que acontece DEPOIS do envio: a
 * resposta e guardada a parte e quem respondeu nao vira integrante.
 */
function SurveyForm({ survey }: { survey: PublicSurvey }) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [closed, setClosed] = useState(false);
  const enviadoRef = useRef(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  /**
   * O questionario visto como um formulario comum.
   *
   * A conversao mora em `@/lib/domain/survey-config`, e e a MESMA usada pela
   * previa do construtor: o ADMIN ve exatamente o que a pessoa vai ver.
   */
  const config = useMemo(() => toSurveyFormConfig(survey), [survey]);
  const form = useDynamicForm(config);
  const sections = useMemo(() => buildSurveySections(config), [config]);
  const percent = completionPercent(config, form.values);
  const faltam = missingRequired(config, form.values);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (enviadoRef.current || submitting) return;

    const values = form.validate();
    if (!values) {
      toast.error('Revise os campos destacados antes de enviar.');
      window.requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }

    enviadoRef.current = true;
    setSubmitting(true);

    // Nome e telefone viajam a parte, como identificacao da resposta: eles
    // tem coluna propria e nao entram de novo entre as respostas.
    const { name, phone } = identityFrom(config, values);

    void submitSurvey({
      name,
      phone,
      answers: answerableFields(config).map((field) => ({
        fieldId: field.id,
        value: (values[field.id] ?? null) as FieldValue,
      })),
    })
      .then(() => setDone(true))
      .catch((falha: unknown) => {
        enviadoRef.current = false;

        // Link encerrado no meio do preenchimento: a tela troca por inteiro,
        // em vez de insistir em um envio que nunca vai passar.
        if (falha instanceof GoneError) {
          setClosed(true);
          return;
        }

        toast.error(
          falha instanceof RepositoryError && falha.message
            ? falha.message
            : 'Não foi possível enviar a resposta. Tente novamente.',
        );
      })
      .finally(() => setSubmitting(false));
  }

  if (closed) return <SurveyClosed />;
  if (done) return <PublicSuccessScreen title={survey.successMessage} />;

  /** O mesmo botao nas duas larguras: muda so o tamanho e a largura total. */
  const submitButton = (fullWidth: boolean) => (
    <Button
      type="submit"
      form="questionario-publico"
      variant="accent"
      size={fullWidth ? 'lg' : undefined}
      loading={submitting}
      fullWidth={fullWidth}
    >
      {!submitting ? <Send aria-hidden="true" className="size-4" /> : null}
      Enviar resposta
    </Button>
  );

  return (
    <PublicFormShell
      owner={survey.owner}
      teamName={survey.clientName}
      bannerTag={survey.bannerTag}
      linkCode={survey.linkCode}
      title={survey.title}
      subtitle="Leva menos de 2 minutos."
      introText={survey.introText}
      percent={percent}
      missing={faltam}
      desktopAction={submitButton(false)}
      mobileAction={submitButton(true)}
    >
      <PublicFormBody
        config={config}
        form={form}
        sections={sections}
        formId="questionario-publico"
        idPrefix="questionario"
        submitting={submitting}
        onSubmit={handleSubmit}
        formRef={formRef}
        allowCamera
        onImageError={(message) => toast.error(message)}
      />
    </PublicFormShell>
  );
}
