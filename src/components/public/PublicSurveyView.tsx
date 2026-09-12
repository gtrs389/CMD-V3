'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Clock, Link2Off, Send, WifiOff } from 'lucide-react';
import type { ClientFormConfig, CustomField, FieldValue, PublicSurvey } from '@/lib/types';
import { fetchPublicSurvey, submitSurvey, type PublicSurveyOutcome } from '@/lib/repositories';
import { GoneError, NetworkError } from '@/lib/repositories/http/api';
import { RepositoryError } from '@/lib/repositories/types';
import { isFilled, visibleFields } from '@/lib/validation/dynamic-form';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { DynamicFieldInput } from '@/components/form-renderer/DynamicFieldInput';
import { useDynamicForm } from '@/components/form-renderer/use-dynamic-form';
import { InviteStateShell } from './InviteChrome';

/**
 * Questionario publico.
 *
 * E o SEGUNDO formulario do sistema, e nao se confunde com o de cadastro:
 * quem responde aqui NAO vira integrante, nao ganha acesso ao painel e nao
 * entra em contagem nenhuma de mobilizacao. A resposta fica guardada a
 * parte, com o nome e o telefone informados.
 *
 * A tela nao recebe nem conhece o codigo do link: ele ficou no cookie
 * `HttpOnly` que a rota de entrada gravou, e toda leitura ou envio o resolve
 * no servidor.
 *
 * Link encerrado, ja respondido ou reservado por outro navegador mostra
 * sempre a MESMA tela, sem revelar o motivo e sem desenhar uma unica
 * pergunta.
 */

/** Identificadores das duas perguntas fixas. Nao sao perguntas do ADMIN. */
const NAME_ID = '__nome';
const PHONE_ID = '__telefone';

/**
 * As duas perguntas fixas do questionario.
 *
 * `systemKey` aqui serve so para a mascara e a validacao ja existentes
 * (nome e telefone brasileiro). Nenhuma verificacao de CPF, titulo ou
 * endereco e acionada: o questionario nao tem nada disso.
 */
const IDENTITY_FIELDS: CustomField[] = [
  {
    id: NAME_ID,
    systemKey: 'name',
    type: 'text',
    label: 'Seu nome',
    placeholder: 'Nome completo',
    helpText: '',
    required: true,
    enabled: true,
    order: -2,
    options: [],
  },
  {
    id: PHONE_ID,
    systemKey: 'phone',
    type: 'phone',
    label: 'Seu telefone',
    placeholder: '(00) 00000-0000',
    helpText: '',
    required: true,
    enabled: true,
    order: -1,
    options: [],
  },
];

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
            : 'Não foi possível carregar o questionário.',
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
          <p className="text-sm">Carregando questionário...</p>
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
      <h1 className="text-lg font-semibold text-ink-900">Questionário encerrado</h1>
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
      <h1 className="text-lg font-semibold text-ink-900">Questionário indisponível</h1>
      <p className="mt-2 text-sm text-balance text-ink-500">
        Este questionário não está ativo no momento. Fale com a pessoa que enviou o link.
      </p>
    </InviteStateShell>
  );
}

/* -------------------------------------------------------------------------
   Formulario
   ------------------------------------------------------------------------- */

function SurveyForm({ survey }: { survey: PublicSurvey }) {
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [closed, setClosed] = useState(false);

  /**
   * As perguntas do ADMIN, precedidas do nome e do telefone.
   *
   * Montadas como uma configuracao de formulario comum: assim o questionario
   * reaproveita, sem copia, a mesma validacao e os mesmos campos do resto do
   * sistema.
   */
  const config = useMemo<ClientFormConfig>(
    () => ({
      fields: [
        ...IDENTITY_FIELDS,
        ...survey.fields.map((field, index) => ({ ...field, order: index })),
      ],
      privacy: {
        enabled: false,
        title: '',
        text: '',
        requireConsent: false,
        consentLabel: '',
      },
      introText: survey.introText,
      successMessage: survey.successMessage,
      updatedAt: new Date().toISOString(),
    }),
    [survey],
  );

  const form = useDynamicForm(config);
  const campos = useMemo(() => visibleFields(config), [config]);

  // O que ainda falta, com o nome de cada pergunta: no celular, o rodape e a
  // unica parte sempre visivel, entao e la que o aviso precisa estar.
  const faltando = campos.filter(
    (field) => field.required && !isFilled(form.values[field.id]),
  );

  async function handleSubmit() {
    if (sending) return;

    const values = form.validate();
    if (!values) {
      toast.error('Revise os campos destacados.');
      return;
    }

    setSending(true);
    try {
      await submitSurvey({
        name: String(values[NAME_ID] ?? ''),
        phone: String(values[PHONE_ID] ?? ''),
        answers: survey.fields.map((field) => ({
          fieldId: field.id,
          value: (values[field.id] ?? null) as FieldValue,
        })),
      });
      setDone(true);
    } catch (falha) {
      // Link encerrado no meio do preenchimento: a tela troca por inteiro,
      // em vez de insistir em um envio que nunca vai passar.
      if (falha instanceof GoneError) {
        setClosed(true);
        return;
      }
      toast.error(
        falha instanceof RepositoryError && falha.message
          ? falha.message
          : 'Não foi possível enviar. Tente novamente.',
      );
    } finally {
      setSending(false);
    }
  }

  if (closed) return <SurveyClosed />;

  if (done) {
    return (
      <InviteStateShell>
        <StateIcon tone="success">
          <CheckCircle2 className="size-6" />
        </StateIcon>
        <h1 className="text-lg font-semibold text-ink-900">Resposta enviada</h1>
        <p className="mt-2 text-sm text-balance text-ink-500">{survey.successMessage}</p>
      </InviteStateShell>
    );
  }

  return (
    <main className="safe-x flex min-h-dvh flex-col bg-surface-muted">
      {/* Cabecalho: de quem veio e o que e. Nada de token, endereco ou
          identificador na tela. */}
      <header className="safe-top border-b border-line bg-surface px-4 py-5 sm:px-6">
        <div className="mx-auto flex w-full max-w-xl items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"
          >
            <ClipboardList className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-ink-900">{survey.title}</h1>
            <p className="truncate text-sm text-ink-500">
              {survey.senderName ? `Enviado por ${survey.senderName}` : survey.clientName}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-xl flex-1 px-4 pt-5 pb-36 sm:px-6">
        {survey.introText ? (
          <p className="mb-5 rounded-card border border-line bg-surface p-4 text-sm whitespace-pre-line text-ink-600">
            {survey.introText}
          </p>
        ) : null}

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
          className="space-y-4 rounded-card border border-line bg-surface p-4 shadow-card sm:p-6"
        >
          {campos.map((field) => (
            <DynamicFieldInput
              key={field.id}
              field={field}
              value={form.values[field.id] ?? null}
              onChange={(value) => form.setValue(field.id, value)}
              error={form.errors[field.id]}
              disabled={sending}
              idPrefix="questionario"
              variant="invite"
            />
          ))}
        </form>
      </div>

      {/* Rodape fixo: o botao de enviar fica sempre ao alcance do polegar, e
          o que falta preencher aparece ali mesmo. */}
      <div className="safe-x fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-6">
        <div className="mx-auto w-full max-w-xl">
          {faltando.length > 0 ? (
            <p className="mb-2 text-center text-xs text-ink-500">
              Falta preencher: {faltando.map((field) => field.label).join(', ')}
            </p>
          ) : null}
          <Button size="lg" fullWidth loading={sending} onClick={() => void handleSubmit()}>
            <Send aria-hidden="true" className="size-4" />
            Enviar resposta
          </Button>
        </div>
      </div>
    </main>
  );
}
