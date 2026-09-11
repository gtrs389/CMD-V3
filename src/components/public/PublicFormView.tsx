'use client';

import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Send } from 'lucide-react';
import type { Client, PublicInviteOwner } from '@/lib/types';
import { PHONE_IN_USE } from '@/lib/types';
import { submitInvite } from '@/lib/repositories';
import { GoneError, NetworkError } from '@/lib/repositories/http/api';
import { RepositoryError } from '@/lib/repositories/types';
import {
  formatCpf,
  formatVoterId,
  isValidCpf,
  isValidVoterId,
  normalizeCpf,
  normalizeVoterId,
} from '@/lib/utils/documents';
import { CONSENT_KEY, toSubmission, visibleFields } from '@/lib/validation/dynamic-form';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { ConfirmSubmissionModal } from './ConfirmSubmissionModal';
import { DynamicFieldInput } from '@/components/form-renderer/DynamicFieldInput';
import { LocationProvider } from '@/components/form-renderer/location-context';
import { useDynamicForm } from '@/components/form-renderer/use-dynamic-form';
import {
  InviteOwnerAside,
  InviteOwnerBanner,
  InviteProgress,
  InviteStateShell,
  InviteStepChips,
} from './InviteChrome';
import { InviteConfirmValueModal } from './InviteConfirmValueModal';
import { InviteReviewStep } from './InviteReviewStep';
import { InviteVerifyingModal } from './InviteVerifyingModal';
import { InviteExpired } from './PublicInviteView';
import { buildInviteSteps, isWideField, stepValueKeys } from './invite-steps';
import { useInviteVerification } from './use-invite-verification';

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
  /** Link encerrado durante o preenchimento: o envio nao acontece. */
  const [expired, setExpired] = useState<'taken' | 'expired' | null>(null);
  const submittedRef = useRef(false);
  const stepRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const form = useDynamicForm(client.form);
  const steps = useMemo(() => buildInviteSteps(client.form), [client.form]);
  const allFields = useMemo(() => visibleFields(client.form), [client.form]);

  const nameFieldId = allFields.find((field) => field.systemKey === 'name')?.id;
  const phoneFieldId = allFields.find((field) => field.systemKey === 'phone')?.id;
  const zoneFieldId = allFields.find((field) => field.systemKey === 'zone')?.id;
  const sectionFieldId = allFields.find((field) => field.systemKey === 'section')?.id;

  const { setValue } = form;
  const verification = useInviteVerification({
    token,
    onNameCorrection: (nome) => {
      if (nameFieldId) setValue(nameFieldId, nome);
    },
    onZonaSecaoFilled: (zona, secao) => {
      if (zoneFieldId) setValue(zoneFieldId, zona ?? '');
      if (sectionFieldId) setValue(sectionFieldId, secao ?? '');
    },
  });

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
      const { cpfToken, tseToken } = verification.getTokens();
      // O cliente de destino vem do token do link, conferido no servidor.
      await submitInvite(token, {
        name: payload.name,
        phone: payload.phone,
        photo: payload.photo,
        gender: payload.gender,
        cpf: payload.cpf,
        voterId: payload.voterId,
        zone: payload.zone,
        section: payload.section,
        state: payload.state,
        city: payload.city,
        district: payload.district,
        street: payload.street,
        relationshipOptionId: payload.relationshipOptionId,
        relationshipLabel: payload.relationshipLabel,
        responses: payload.responses,
        consentAt: payload.consentAt,
        cpfToken,
        tseToken,
      });

      setConfirming(false);
      setDone(true);
    } catch (error) {
      // Prazo vencido no meio do caminho, link ja usado ou reservado por
      // outra pessoa: o servidor recusou e nada foi gravado.
      if (error instanceof GoneError) {
        setConfirming(false);
        setExpired(error.reason);
        return;
      }

      submittedRef.current = false;

      // Telefone ja cadastrado naquele time: o cadastro nao foi concluido e a
      // recusa aparece no proprio campo, na etapa dele. So o servidor sabe
      // disso — a tela publica nunca consulta quem ja existe no time.
      const duplicado =
        error instanceof RepositoryError &&
        !(error instanceof NetworkError) &&
        error.message === PHONE_IN_USE;

      if (duplicado && phoneFieldId) {
        setConfirming(false);
        form.setFieldError(phoneFieldId, PHONE_IN_USE);
        const target = steps.findIndex((step) =>
          stepValueKeys(step, client.form).includes(phoneFieldId),
        );
        if (target >= 0) goTo(target);
        window.requestAnimationFrame(() => focusFirstInvalid(stepRef.current));
        toast.error(PHONE_IN_USE);
        return;
      }

      toast.error(
        error instanceof NetworkError
          ? error.message
          : 'Não foi possível enviar o cadastro. Tente novamente.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  // O servidor encerrou o link: nenhum campo do formulario continua na tela.
  if (expired) return <InviteExpired reason={expired} />;

  if (done) return <SuccessScreen />;

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
    <main className="safe-x min-h-dvh bg-surface-muted lg:flex lg:h-dvh lg:overflow-hidden">
      {/* Desktop: coluna azul-marinho fixa, com as etapas verticais. Nunca
          rola — so a coluna do formulario, ao lado, tem rolagem propria. */}
      <InviteOwnerAside
        owner={owner}
        fallbackName={client.name}
        steps={steps}
        current={position}
        className="hidden lg:flex lg:h-dvh lg:w-[22rem] lg:shrink-0 lg:overflow-y-auto"
      />

      {/* Unica coluna que rola no desktop; no celular e a pagina inteira. */}
      <div className="lg:h-dvh lg:flex-1 lg:overflow-y-auto">
        {/* Celular: cartao azul-marinho horizontal, no topo. */}
        <div className="safe-top px-4 pt-4 sm:px-6 lg:hidden">
          <InviteOwnerBanner owner={owner} fallbackName={client.name} />
        </div>

        <LocationProvider fields={allFields} values={form.values} setValue={form.setValue}>
          <div className="mx-auto w-full max-w-2xl px-4 pt-4 pb-32 sm:px-6 lg:px-14 lg:py-12 lg:pb-16">
            {/* Celular: progresso em cartao proprio. */}
            <div className="rounded-card border border-line bg-surface p-3.5 shadow-card lg:hidden">
              <InviteProgress steps={steps} current={position} />
              <InviteStepChips steps={steps} current={position} />
            </div>

            <section
              ref={cardRef}
              className="mt-3 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5 lg:mt-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
            >
              <InviteProgress steps={steps} current={position} className="hidden lg:block" />

              <div className="lg:mt-8">
                <h1 className="text-xl leading-tight font-bold tracking-tight text-ink-900 sm:text-[1.5rem] lg:text-[1.75rem]">
                  {current.title}
                </h1>
                <p className="mt-1.5 text-sm text-ink-500">{current.description}</p>
              </div>

              <form id="cadastro-publico" onSubmit={handleAdvance} noValidate className="contents">
                <div key={current.id} ref={stepRef} className="mt-5 animate-rise lg:mt-6">
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
                        <div
                          key={field.id}
                          className={isWideField(field) ? 'sm:col-span-2' : undefined}
                        >
                          <DynamicFieldInput
                            field={field}
                            idPrefix="publico"
                            variant="invite"
                            allowCamera
                            disabled={submitting}
                            value={form.values[field.id] ?? null}
                            error={form.errors[field.id]}
                            onChange={(value) => form.setValue(field.id, value)}
                            onBlur={
                              field.systemKey === 'cpf'
                                ? (value) => {
                                    const digits = normalizeCpf(
                                      typeof value === 'string' ? value : '',
                                    );
                                    if (isValidCpf(digits)) verification.requestCpfConfirmation(digits);
                                  }
                                : field.systemKey === 'voter_id'
                                  ? (value) => {
                                      const digits = normalizeVoterId(
                                        typeof value === 'string' ? value : '',
                                      );
                                      if (isValidVoterId(digits)) {
                                        verification.requestTituloConfirmation(digits);
                                      }
                                    }
                                  : undefined
                            }
                            onImageError={(message) => toast.error(message)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Desktop: acoes abaixo do formulario. */}
                <div className="mt-7 hidden items-center justify-between gap-4 lg:flex">
                  <p className="text-xs text-ink-500">{REQUIRED_HINT}</p>
                  <div className="flex shrink-0 items-center gap-2">{actions}</div>
                </div>
              </form>

              <p className="mt-5 text-xs text-ink-500 lg:hidden">{REQUIRED_HINT}</p>
            </section>
          </div>
        </LocationProvider>
      </div>

      {/* Celular: "Continuar" fixo no rodape, com area segura. O conteudo
          reserva espaco equivalente para nunca ficar encoberto. */}
      <div className="safe-bottom safe-x fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-3 sm:px-6">
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

      <InviteConfirmValueModal
        open={verification.pending?.kind === 'cpf'}
        title="Confirme seu CPF"
        description={`Você digitou ${
          verification.pending ? formatCpf(verification.pending.value) : ''
        }. Está correto?`}
        onCancel={verification.cancel}
        onConfirm={verification.confirm}
      />

      <InviteConfirmValueModal
        open={verification.pending?.kind === 'titulo'}
        title="Confirme seu título de eleitor"
        description={`Você digitou ${
          verification.pending ? formatVoterId(verification.pending.value) : ''
        }. Está correto?`}
        onCancel={verification.cancel}
        onConfirm={verification.confirm}
      />

      <InviteVerifyingModal open={verification.loading} />
    </main>
  );
}

/**
 * Tela final do cadastro.
 *
 * Somente o agradecimento: nenhum link, telefone, credencial, botao de
 * login ou instrucao. O acesso do integrante ja existe — ele entra pelo link
 * do time com o telefone que acabou de informar —, mas nada disso aparece
 * aqui.
 *
 * Recarregar esta pagina ou abrir o mesmo link de novo mostra "Link
 * expirado": o link foi consumido em definitivo.
 */
function SuccessScreen() {
  return (
    <InviteStateShell>
      <span
        aria-hidden="true"
        className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-success-50 text-success-600"
      >
        <CheckCircle2 className="size-7" />
      </span>

      <h1 className="text-lg font-semibold text-ink-900">Obrigado por se cadastrar!</h1>
    </InviteStateShell>
  );
}
