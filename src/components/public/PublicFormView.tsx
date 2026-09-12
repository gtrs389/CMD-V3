'use client';

import { useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, Send } from 'lucide-react';
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
import {
  CONSENT_KEY,
  completionPercent,
  filledCount,
  missingRequired,
  toSubmission,
  visibleFields,
} from '@/lib/validation/dynamic-form';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { ConfirmSubmissionModal } from './ConfirmSubmissionModal';
import { DynamicFieldInput } from '@/components/form-renderer/DynamicFieldInput';
import { LocationProvider } from '@/components/form-renderer/location-context';
import { useDynamicForm } from '@/components/form-renderer/use-dynamic-form';
import { InviteBanner } from './InviteBanner';
import { InviteOwnerAside, InviteOwnerBanner, InviteStateShell } from './InviteChrome';
import { InviteConfirmValueModal } from './InviteConfirmValueModal';
import { InvitePrivacyNotice } from './InvitePrivacyNotice';
import { InviteVerifyingModal } from './InviteVerifyingModal';
import { InviteExpired } from './PublicInviteView';
import { buildInviteSections, isWideField } from './invite-sections';
import { useInviteDeviceReport } from './use-invite-device-report';
import { useInviteVerification } from './use-invite-verification';

const REQUIRED_HINT = 'Campos marcados com * são obrigatórios.';

interface PublicFormViewProps {
  client: Client;
  /** Quem enviou o convite: apenas nome, foto e perfil. */
  owner: PublicInviteOwner | null;
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
 * Pagina publica de cadastro, em UMA pagina so.
 *
 * Nao ha etapas: todos os campos ficam visiveis de uma vez, agrupados por
 * secao, e a pessoa rola a tela ate o fim. Ninguem se perde entre telas nem
 * descobre tarde que faltava preencher algo la atras.
 *
 * Os campos, a obrigatoriedade e as opcoes vem da configuracao real feita
 * pelo ADMIN: campo desativado nao aparece e nao e enviado. Nada do que e
 * digitado sai da memoria da aba — nem `localStorage`, nem `sessionStorage`,
 * nem cookie, nem URL — e o envio acontece so depois da confirmacao final,
 * no resumo do modal.
 */
export function PublicFormView({ client, owner }: PublicFormViewProps) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  /** Link encerrado durante o preenchimento: o envio nao acontece. */
  const [expired, setExpired] = useState<'taken' | 'expired' | null>(null);
  const submittedRef = useRef(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  // Complementacao UNICA dos dados do aparelho daquele clique. O clique ja
  // foi registrado no servidor, com o horario do banco; aqui vai apenas o que
  // so o navegador conhece, e nada disso bloqueia o formulario.
  useInviteDeviceReport();

  const form = useDynamicForm(client.form);
  const sections = useMemo(() => buildInviteSections(client.form), [client.form]);
  const allFields = useMemo(() => visibleFields(client.form), [client.form]);
  const percent = completionPercent(client.form, form.values);
  // Quanto falta para poder enviar. Numero de leitura: quem aceita o envio
  // continua sendo a validacao.
  const faltam = missingRequired(client.form, form.values);

  const nameFieldId = allFields.find((field) => field.systemKey === 'name')?.id;
  const phoneFieldId = allFields.find((field) => field.systemKey === 'phone')?.id;
  const zoneFieldId = allFields.find((field) => field.systemKey === 'zone')?.id;
  const sectionFieldId = allFields.find((field) => field.systemKey === 'section')?.id;

  const { setValue } = form;
  const verification = useInviteVerification({
    onNameCorrection: (nome) => {
      if (nameFieldId) setValue(nameFieldId, nome);
    },
    onZonaSecaoFilled: (zona, secao) => {
      if (zoneFieldId) setValue(zoneFieldId, zona ?? '');
      if (sectionFieldId) setValue(sectionFieldId, secao ?? '');
    },
  });

  /**
   * Envio: o formulario inteiro e conferido de uma vez.
   *
   * Com erro, a pessoa fica onde esta, ve as mensagens em todos os campos
   * destacados e o foco vai para o primeiro deles — que pode estar em
   * qualquer ponto da pagina, porque tudo e uma tela so.
   */
  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submittedRef.current || submitting) return;

    if (!form.validate()) {
      toast.error('Revise os campos destacados antes de enviar.');
      window.requestAnimationFrame(() => focusFirstInvalid(formRef.current));
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
      // O cliente de destino vem do contexto do link, guardado em cookie e
      // resolvido no servidor: o payload nao carrega token nenhum.
      await submitInvite({
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
      // recusa aparece no proprio campo, que a pagina rola ate mostrar. So o
      // servidor sabe disso — a tela publica nunca consulta quem ja existe
      // no time.
      const duplicado =
        error instanceof RepositoryError &&
        !(error instanceof NetworkError) &&
        error.message === PHONE_IN_USE;

      if (duplicado && phoneFieldId) {
        setConfirming(false);
        form.setFieldError(phoneFieldId, PHONE_IN_USE);
        window.requestAnimationFrame(() => focusFirstInvalid(formRef.current));
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

  // Desktop: a acao fica abaixo do formulario. No celular ela mora no rodape
  // fixo, junto do que ainda falta.
  const actions = (
    <Button
      type="submit"
      form="cadastro-publico"
      variant="accent"
      loading={submitting}
    >
      {!submitting ? <Send aria-hidden="true" className="size-4" /> : null}
      Enviar cadastro
    </Button>
  );

  const barraDeAvanco = (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={`Cadastro ${percent}% preenchido`}
      className="h-1.5 w-full overflow-hidden rounded-pill bg-ink-100"
    >
      <span
        className="block h-full rounded-pill bg-success-600 transition-[width] duration-500"
        style={{ width: `${percent}%` }}
      />
    </div>
  );

  return (
    <main className="safe-x min-h-dvh bg-surface-muted lg:flex lg:h-dvh lg:overflow-hidden">
      {/* Desktop: coluna azul-marinho fixa. Nunca rola — so a coluna do
          formulario, ao lado, tem rolagem propria. */}
      <InviteOwnerAside
        owner={owner}
        fallbackName={client.name}
        className="hidden lg:flex lg:h-dvh lg:w-[22rem] lg:shrink-0 lg:overflow-y-auto"
      />

      {/* Unica coluna que rola no desktop; no celular e a pagina inteira. */}
      <div className="lg:h-dvh lg:flex-1 lg:overflow-y-auto">
        {/* Celular (abaixo de 768px): o banner oficial do time, servido como
            arquivo, ocupando a largura inteira. Em tablet e desktop ele nao
            e renderizado. */}
        <div className="safe-top md:hidden">
          <InviteBanner
            teamName={client.name}
            tag={client.bannerTag}
            fallback={<InviteOwnerBanner owner={owner} fallbackName={client.name} />}
          />
        </div>

        {/* Tablet (768px a 1023px): sem banner, a faixa de convite de sempre
            continua dando o contexto de quem convidou. */}
        <div className="safe-top hidden md:block lg:hidden">
          <InviteOwnerBanner owner={owner} fallbackName={client.name} />
        </div>

        {/* Celular: assim que o cartao do convite sai da tela, esta faixa
            gruda no topo. E a unica orientacao necessaria durante a rolagem —
            onde a pessoa esta e quanto ja preencheu — e ela nunca some. */}
        <div className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur lg:hidden">
          <div className="mx-auto w-full max-w-2xl px-4 py-2.5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[0.625rem] font-bold tracking-[0.12em] text-ink-500 uppercase">
                Preenchimento
              </p>
              <p className="shrink-0 text-xs font-bold text-success-600 tabular-nums">
                {percent}%
              </p>
            </div>
            <div className="mt-2">{barraDeAvanco}</div>
          </div>
        </div>

        <LocationProvider fields={allFields} values={form.values} setValue={form.setValue}>
          <div className="mx-auto w-full max-w-2xl px-4 pt-5 pb-36 sm:px-6 lg:px-14 lg:py-12 lg:pb-16">
            <div>
              <h1 className="text-xl leading-tight font-bold tracking-tight text-ink-900 sm:text-[1.5rem] lg:text-[1.75rem]">
                Ficha de cadastro
              </h1>
              <p className="mt-1.5 text-sm text-ink-500">Leva menos de 2 minutos.</p>
            </div>

            {/* Desktop: o avanco fica aqui. No celular ele vive na faixa do
                topo, sempre a vista. */}
            <div className="mt-4 hidden border-y border-line py-3 lg:block">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[0.625rem] font-bold tracking-[0.12em] text-ink-500 uppercase">
                  Preenchimento
                </p>
                <p className="text-xs font-bold text-success-600 tabular-nums">{percent}%</p>
              </div>
              <div className="mt-2">{barraDeAvanco}</div>
            </div>

            {client.form.introText ? (
              <p className="mt-4 rounded-control border border-line bg-surface p-3 text-sm text-ink-700 shadow-card lg:bg-ink-50 lg:shadow-none">
                {client.form.introText}
              </p>
            ) : null}

            <form
              id="cadastro-publico"
              ref={formRef}
              onSubmit={handleSubmit}
              noValidate
              className="contents"
            >
              {/* Celular: cada secao e um cartao proprio, numerado. A rolagem
                  ganha ritmo e a pessoa enxerga o tamanho do que falta em vez
                  de encarar uma folha unica e interminavel.
                  Desktop: os mesmos blocos, sem cartao, como sempre foram. */}
              <div className="mt-5 animate-rise space-y-4 lg:mt-6 lg:space-y-7">
                {sections.map((section, index) => {
                  const total = section.fields.length;
                  const preenchidos = filledCount(section.fields, form.values);
                  const completa = total > 0 && preenchidos === total;

                  return (
                    <section
                      key={section.id}
                      aria-labelledby={`secao-${section.id}`}
                      className="scroll-mt-24 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5 lg:scroll-mt-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className={cn(
                            'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold lg:hidden',
                            completa
                              ? 'bg-success-50 text-success-600'
                              : 'bg-brand-50 text-brand-700',
                          )}
                        >
                          {completa ? <Check className="size-4" /> : index + 1}
                        </span>

                        <div className="min-w-0 flex-1">
                          <h2
                            id={`secao-${section.id}`}
                            className="text-[0.9375rem] font-semibold text-ink-900"
                          >
                            {section.title}
                          </h2>
                          <p className="mt-1 text-[0.8125rem] text-ink-500">
                            {section.description}
                          </p>
                        </div>

                        <span className="shrink-0 rounded-pill bg-ink-50 px-2 py-1 text-[0.6875rem] font-semibold text-ink-500 tabular-nums lg:hidden">
                          {preenchidos}/{total}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-5">
                        {section.fields.map((field) => (
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
                                      if (isValidCpf(digits)) {
                                        verification.requestCpfConfirmation(digits);
                                      }
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
                    </section>
                  );
                })}

                {/* Aviso e aceite ficam onde a pessoa termina de preencher.
                    Sem aviso configurado pelo ADMIN, o cartao nem existe. */}
                {client.form.privacy.enabled ? (
                  <div className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-5 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
                    <InvitePrivacyNotice
                      config={client.form}
                      accepted={form.values[CONSENT_KEY] === true}
                      disabled={submitting}
                      error={form.errors[CONSENT_KEY]}
                      onChange={(accepted) => form.setValue(CONSENT_KEY, accepted)}
                    />
                  </div>
                ) : null}
              </div>

              {/* Desktop: acoes abaixo do formulario. */}
              <div className="mt-7 hidden items-center justify-between gap-4 lg:flex">
                <p className="text-xs text-ink-500">{REQUIRED_HINT}</p>
                <div className="flex shrink-0 items-center gap-2">{actions}</div>
              </div>
            </form>

            <p className="mt-5 text-center text-xs text-ink-500 lg:hidden">{REQUIRED_HINT}</p>
          </div>
        </LocationProvider>
      </div>

      {/* Celular: o envio fica fixo no rodape, com area segura, e diz quanto
          falta antes de a pessoa tentar enviar. O conteudo reserva espaco
          equivalente para nunca ficar encoberto. */}
      <div className="safe-bottom safe-x fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="mx-auto w-full max-w-2xl space-y-2 px-4 py-3 sm:px-6">
          <p
            aria-live="polite"
            className={cn(
              'text-center text-xs font-medium',
              faltam === 0 ? 'text-success-600' : 'text-ink-500',
            )}
          >
            {faltam === 0
              ? 'Tudo pronto para enviar.'
              : `Ainda ${faltam === 1 ? 'falta' : 'faltam'} ${faltam} ${
                  faltam === 1 ? 'campo obrigatório' : 'campos obrigatórios'
                }.`}
          </p>

          <Button
            type="submit"
            form="cadastro-publico"
            variant="accent"
            size="lg"
            loading={submitting}
            fullWidth
          >
            {!submitting ? <Send aria-hidden="true" className="size-4" /> : null}
            Enviar cadastro
          </Button>
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
        label="CPF"
        value={verification.pending ? formatCpf(verification.pending.value) : ''}
        onCancel={verification.cancel}
        onConfirm={verification.confirm}
      />

      <InviteConfirmValueModal
        open={verification.pending?.kind === 'titulo'}
        label="título de eleitor"
        value={verification.pending ? formatVoterId(verification.pending.value) : ''}
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
        className="mx-auto mb-4 flex size-14 animate-pop items-center justify-center rounded-full bg-success-50 text-success-600"
      >
        <CheckCircle2 className="size-7" />
      </span>

      <h1 className="text-lg font-semibold text-ink-900">Obrigado por se cadastrar!</h1>
    </InviteStateShell>
  );
}
