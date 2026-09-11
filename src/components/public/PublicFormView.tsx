'use client';

import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  LogIn,
  Send,
  ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';
import type { Client, PublicInviteOwner } from '@/lib/types';
import { submitInvite, type CreatedAccess } from '@/lib/repositories';
import { NetworkError } from '@/lib/repositories/http/api';
import { copyText } from '@/lib/utils/clipboard';
import { LOGIN_PATH } from '@/lib/auth/constants';
import { CONSENT_KEY, toSubmission, visibleFields } from '@/lib/validation/dynamic-form';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { ConfirmSubmissionModal } from './ConfirmSubmissionModal';
import { DynamicFieldInput } from '@/components/form-renderer/DynamicFieldInput';
import { LocationProvider } from '@/components/form-renderer/location-context';
import { useDynamicForm } from '@/components/form-renderer/use-dynamic-form';
import {
  InviteBrandBar,
  InviteOwnerAside,
  InviteOwnerBanner,
  InviteProgress,
  InviteStateShell,
  InviteStepChips,
} from './InviteChrome';
import { InviteReviewStep } from './InviteReviewStep';
import { buildInviteSteps, isWideField, stepValueKeys } from './invite-steps';

/**
 * Aviso curto sobre os sinais tecnicos registrados no envio.
 * Aparece sempre, independente do aviso de privacidade do cliente.
 */
const DEVICE_NOTICE =
  'Ao enviar, registramos dados técnicos do aparelho e da conexão para segurança e prevenção de fraude.';

const REQUIRED_HINT = 'Campos marcados com * são obrigatórios.';

interface PublicFormViewProps {
  client: Client;
  /** Quem enviou o convite: apenas nome, foto e perfil. */
  owner: PublicInviteOwner | null;
  /** Token do link aberto. Identifica no servidor a operacao e o responsavel. */
  token: string;
}

/** Rolagem sem movimento quando o sistema pede menos animacao. */
function scrollBehavior(): ScrollBehavior {
  if (typeof window === 'undefined') return 'auto';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/** Leva o foco para o primeiro campo invalido da etapa. */
function focusFirstInvalid(container: HTMLElement | null) {
  if (!container) return;

  const invalid = container.querySelector<HTMLElement>('[aria-invalid="true"]');
  const target =
    invalid &&
    (invalid.matches('input, select, textarea, button, [tabindex]')
      ? invalid
      : invalid.querySelector<HTMLElement>('input, select, textarea, button'));

  const anchor = target ?? invalid ?? container.querySelector<HTMLElement>('[role="alert"]');
  anchor?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  target?.focus({ preventScroll: true });
}

/**
 * Pagina publica de cadastro, em quatro etapas.
 *
 * Os campos, a obrigatoriedade e as opcoes vem da configuracao real feita
 * pelo ADMIN: campo desativado nao aparece e nao e enviado. Nada do que e
 * digitado sai da memoria da aba — nem `localStorage`, nem `sessionStorage`,
 * nem cookie, nem URL — e o envio acontece so depois da confirmacao final.
 */
export function PublicFormView({ client, owner, token }: PublicFormViewProps) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  /**
   * Credencial recem-criada.
   *
   * Vive apenas neste estado, exibida uma unica vez. Fechar ou recarregar a
   * tela a faz desaparecer: nada disso vai para armazenamento do navegador,
   * URL ou log.
   */
  const [access, setAccess] = useState<CreatedAccess | null>(null);
  const submittedRef = useRef(false);
  const stepRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const form = useDynamicForm(client.form);
  const steps = useMemo(() => buildInviteSteps(client.form), [client.form]);
  const allFields = useMemo(() => visibleFields(client.form), [client.form]);

  const [index, setIndex] = useState(0);
  const position = Math.min(index, steps.length - 1);
  const current = steps[position];
  const isReview = current.id === 'revisao';
  const fillSteps = useMemo(() => steps.filter((step) => step.id !== 'revisao'), [steps]);

  /** Muda de etapa e volta o cartao para o topo. */
  function goTo(next: number) {
    setIndex(Math.max(0, Math.min(next, steps.length - 1)));
    cardRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }

  /** Abre a etapa do primeiro campo com erro, quando ele nao e desta. */
  function jumpToInvalid(): boolean {
    const invalid = Object.keys(form.errors);
    if (invalid.length === 0) return false;

    const target = steps.findIndex((step) =>
      stepValueKeys(step, client.form).some((key) => invalid.includes(key)),
    );
    if (target >= 0 && target !== position) {
      goTo(target);
      return true;
    }
    return false;
  }

  /**
   * "Continuar": valida somente a etapa atual.
   *
   * Com erro, a pessoa fica onde esta, ve a mensagem e o foco vai para o
   * primeiro campo invalido.
   */
  function handleAdvance(event: React.FormEvent) {
    event.preventDefault();
    if (submittedRef.current || submitting) return;

    const keys = stepValueKeys(current, client.form);
    if (!form.validateOnly(keys)) {
      toast.error('Revise os campos destacados para continuar.');
      window.requestAnimationFrame(() => focusFirstInvalid(stepRef.current));
      return;
    }

    if (!isReview) {
      goTo(position + 1);
      return;
    }

    // Ultima etapa: confere o formulario inteiro antes da confirmacao.
    if (!form.validate()) {
      toast.error('Revise os campos destacados antes de enviar.');
      window.requestAnimationFrame(() => {
        if (!jumpToInvalid()) focusFirstInvalid(stepRef.current);
      });
      return;
    }

    setConfirming(true);
  }

  /** Envio, apos a confirmacao explicita. */
  async function handleConfirm() {
    // Barra duplo clique e reenvio antes mesmo do estado do React atualizar.
    if (submittedRef.current || submitting) return;

    const values = form.validate();
    if (!values) {
      setConfirming(false);
      toast.error('Revise os campos destacados antes de enviar.');
      return;
    }

    submittedRef.current = true;
    setSubmitting(true);

    try {
      const payload = toSubmission(client.form, values);
      // O cliente de destino vem do token do link, conferido no servidor.
      const outcome = await submitInvite(token, {
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
        photo: payload.photo,
        gender: payload.gender,
        cpf: payload.cpf,
        voterId: payload.voterId,
        state: payload.state,
        city: payload.city,
        district: payload.district,
        street: payload.street,
        relationshipOptionId: payload.relationshipOptionId,
        relationshipLabel: payload.relationshipLabel,
        responses: payload.responses,
        consentAt: payload.consentAt,
      });

      setConfirming(false);
      setAccess(outcome);
      setDone(true);
    } catch (error) {
      submittedRef.current = false;
      toast.error(
        error instanceof NetworkError
          ? error.message
          : 'Não foi possível enviar o cadastro. Tente novamente.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <SuccessScreen
        client={client}
        access={access}
        onNew={() => {
          submittedRef.current = false;
          form.reset();
          setIndex(0);
          // A senha sai da memoria assim que a tela muda.
          setAccess(null);
          setDone(false);
        }}
      />
    );
  }

  const nextLabel = isReview ? 'Confirmar cadastro' : 'Continuar';

  const actions = (
    <>
      {position > 0 ? (
        <Button
          variant="secondary"
          disabled={submitting}
          onClick={() => goTo(position - 1)}
          className="shrink-0"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Voltar
        </Button>
      ) : null}

      <Button
        type="submit"
        form="cadastro-publico"
        variant="accent"
        loading={submitting}
        className="flex-1 lg:flex-none"
      >
        {isReview && !submitting ? <Send aria-hidden="true" className="size-4" /> : null}
        {nextLabel}
        {!isReview ? <ArrowRight aria-hidden="true" className="size-4" /> : null}
      </Button>
    </>
  );

  return (
    <main className="safe-x min-h-dvh bg-surface-muted">
      <InviteBrandBar />

      <LocationProvider fields={allFields} values={form.values} setValue={form.setValue}>
        <div className="mx-auto grid w-full max-w-[76rem] grid-cols-1 gap-3 px-4 pt-4 pb-32 sm:px-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-6 lg:py-8 lg:pb-10">
          {/* Celular: cartao azul-marinho horizontal. */}
          <InviteOwnerBanner owner={owner} fallbackName={client.name} className="lg:hidden" />

          {/* Desktop: cartao azul-marinho lateral, com as etapas verticais. */}
          <InviteOwnerAside
            owner={owner}
            fallbackName={client.name}
            steps={steps}
            current={position}
            className="hidden lg:flex"
          />

          {/* Celular: progresso em cartao proprio. */}
          <div className="rounded-card border border-line bg-surface p-3.5 shadow-card lg:hidden">
            <InviteProgress steps={steps} current={position} />
            <InviteStepChips steps={steps} current={position} />
          </div>

          <section
            ref={cardRef}
            className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-5 lg:flex lg:flex-col lg:p-7"
          >
            <InviteProgress steps={steps} current={position} className="hidden lg:block" />

            <div className="lg:mt-7">
              <h1 className="text-xl leading-tight font-bold tracking-tight text-ink-900 sm:text-[1.5rem] lg:text-[1.75rem]">
                {current.title}
              </h1>
              <p className="mt-1.5 text-sm text-ink-500">{current.description}</p>
            </div>

            <form id="cadastro-publico" onSubmit={handleAdvance} noValidate className="contents">
              <div key={current.id} ref={stepRef} className="mt-5 animate-rise lg:mt-6 lg:flex-1">
                {position === 0 && client.form.introText ? (
                  <p className="mb-4 rounded-control border border-line bg-ink-50 p-3 text-sm text-ink-700">
                    {client.form.introText}
                  </p>
                ) : null}

                {isReview ? (
                  <InviteReviewStep
                    config={client.form}
                    values={form.values}
                    steps={fillSteps}
                    disabled={submitting}
                    consentError={form.errors[CONSENT_KEY]}
                    deviceNotice={DEVICE_NOTICE}
                    onEditStep={goTo}
                    onConsentChange={(accepted) => form.setValue(CONSENT_KEY, accepted)}
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-5">
                    {current.fields.map((field) => (
                      <div key={field.id} className={isWideField(field) ? 'sm:col-span-2' : undefined}>
                        <DynamicFieldInput
                          field={field}
                          idPrefix="publico"
                          variant="invite"
                          allowCamera
                          disabled={submitting}
                          value={form.values[field.id] ?? null}
                          error={form.errors[field.id]}
                          onChange={(value) => form.setValue(field.id, value)}
                          onImageError={(message) => toast.error(message)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Desktop: acoes no proprio cartao. */}
              <div className="mt-7 hidden items-center justify-between gap-4 lg:flex">
                <p className="text-xs text-ink-500">{REQUIRED_HINT}</p>
                <div className="flex shrink-0 items-center gap-2">{actions}</div>
              </div>
            </form>

            <p className="mt-5 text-xs text-ink-500 lg:hidden">{REQUIRED_HINT}</p>
          </section>
        </div>
      </LocationProvider>

      {/* Celular: "Continuar" fixo no rodape, com area segura. O conteudo
          reserva espaco equivalente para nunca ficar encoberto. */}
      <div className="safe-bottom safe-x fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex w-full max-w-[76rem] items-center gap-2 px-4 py-3 sm:px-6">
          {actions}
        </div>
      </div>

      <ConfirmSubmissionModal
        open={confirming}
        config={client.form}
        values={form.values}
        submitting={submitting}
        onCancel={() => setConfirming(false)}
        onConfirm={handleConfirm}
      />
    </main>
  );
}

interface SuccessScreenProps {
  client: Client;
  /** Credencial mostrada uma unica vez. Nula quando nao houve criacao. */
  access: CreatedAccess | null;
  onNew: () => void;
}

function SuccessScreen({ client, access, onNew }: SuccessScreenProps) {
  return (
    <InviteStateShell>
      <span
        aria-hidden="true"
        className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-success-50 text-success-600"
      >
        <CheckCircle2 className="size-7" />
      </span>

      <h1 className="text-lg font-semibold text-ink-900">{client.form.successMessage}</h1>
      <p className="mt-2 text-sm text-balance text-ink-500">
        Seu cadastro foi registrado na equipe de {client.name}.
      </p>

      {access ? <AccessCreatedCard access={access} /> : null}

      <Button variant="secondary" fullWidth className="mt-3" onClick={onNew}>
        Cadastrar outra pessoa
      </Button>
    </InviteStateShell>
  );
}

/**
 * Acesso criado para quem acabou de se cadastrar.
 *
 * A senha temporaria aparece uma unica vez, aqui. Ela nao e gravada em
 * `localStorage`, `sessionStorage`, URL, log nem no banco em texto puro:
 * ao fechar ou recarregar a tela, some.
 */
function AccessCreatedCard({ access }: { access: CreatedAccess }) {
  const toast = useToast();
  const [copied, setCopied] = useState<'email' | 'senha' | null>(null);

  async function copy(label: 'email' | 'senha', value: string) {
    const ok = await copyText(value);
    if (!ok) {
      toast.error('Não foi possível copiar. Selecione o texto manualmente.');
      return;
    }
    setCopied(label);
    toast.success(label === 'email' ? 'E-mail copiado.' : 'Senha copiada.');
    window.setTimeout(() => setCopied((state) => (state === label ? null : state)), 2000);
  }

  return (
    <section
      aria-labelledby="acesso-criado"
      className="mt-6 rounded-card border border-line bg-ink-50 p-4 text-left"
    >
      <h2
        id="acesso-criado"
        className="flex items-center gap-2 text-sm font-semibold text-ink-900"
      >
        <KeyRound aria-hidden="true" className="size-4 shrink-0 text-brand-700" />
        Seu acesso ao CMD foi criado
      </h2>

      <dl className="mt-3 space-y-2">
        <CredentialLine
          label="E-mail"
          value={access.email}
          copied={copied === 'email'}
          onCopy={() => copy('email', access.email)}
        />
        <CredentialLine
          label="Senha temporária"
          value={access.password}
          copied={copied === 'senha'}
          onCopy={() => copy('senha', access.password)}
        />
      </dl>

      <p className="mt-3 flex items-start gap-2 rounded-control border border-warning-50 bg-warning-50 px-3 py-2.5 text-xs text-warning-600">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0">
          Copie agora: a senha aparece uma única vez. A troca é obrigatória no primeiro acesso.
        </span>
      </p>

      <Link
        href={LOGIN_PATH}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-brand-700 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-800"
      >
        <LogIn aria-hidden="true" className="size-4" />
        Acessar o sistema
      </Link>
    </section>
  );
}

function CredentialLine({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-ink-500">{label}</dt>
        <dd className="truncate font-mono text-sm text-ink-900">{value}</dd>
      </div>
      <button
        type="button"
        onClick={onCopy}
        aria-label={`Copiar ${label.toLowerCase()}`}
        className="flex size-11 shrink-0 items-center justify-center rounded-control border border-line bg-surface text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
      >
        {copied ? (
          <Check aria-hidden="true" className="size-4 text-success-600" />
        ) : (
          <Copy aria-hidden="true" className="size-4" />
        )}
      </button>
    </div>
  );
}
