'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, Copy, KeyRound, LogIn, Send, ShieldAlert, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { appConfig } from '@/config/app.config';
import type { Client } from '@/lib/types';
import { submitInvite, type CreatedAccess } from '@/lib/repositories';
import { NetworkError } from '@/lib/repositories/http/api';
import { copyText } from '@/lib/utils/clipboard';
import { LOGIN_PATH } from '@/lib/auth/constants';
import {
  CONSENT_KEY,
  toSubmission,
  visibleFields,
  type DynamicFormValues,
} from '@/lib/validation/dynamic-form';
import { useFormDraft } from '@/hooks/use-form-draft';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { useToast } from '@/components/ui/Toast';
import { ConfirmSubmissionModal } from './ConfirmSubmissionModal';
import { DynamicFieldInput } from '@/components/form-renderer/DynamicFieldInput';
import { LocationProvider } from '@/components/form-renderer/location-context';
import { useDynamicForm } from '@/components/form-renderer/use-dynamic-form';

/**
 * Aviso curto sobre os sinais tecnicos registrados no envio.
 * Aparece sempre, independente do aviso de privacidade do cliente.
 */
const DEVICE_NOTICE =
  'Ao enviar, registramos dados técnicos do aparelho e da conexão para segurança e prevenção de fraude.';

interface PublicFormViewProps {
  client: Client;
  /** Token do link aberto. Identifica no servidor a operacao e o responsavel. */
  token: string;
}

/**
 * Formulario publico de cadastro de equipe.
 *
 * Pensado para o celular: uma coluna, campos grandes, foto pela camera ou
 * galeria, rascunho preservado e protecao contra envio duplicado.
 */
export function PublicFormView({ client, token }: PublicFormViewProps) {
  const toast = useToast();
  const draft = useFormDraft<DynamicFormValues>(`convite.${token}`);
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
  const restoredRef = useRef(false);

  const form = useDynamicForm(client.form, undefined, (values) => draft.save(values));
  const fields = visibleFields(client.form);
  const { privacy } = client.form;

  const { reset } = form;

  // Recupera o preenchimento anterior uma unica vez, apos a hidratacao.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const saved = draft.read();
    if (!saved) return;

    const known = new Set(fields.map((field) => field.id));
    known.add(CONSENT_KEY);

    const merged: DynamicFormValues = {};
    for (const [key, value] of Object.entries(saved)) {
      if (known.has(key) && value !== undefined) merged[key] = value;
    }

    if (Object.keys(merged).length > 0) {
      reset({ ...form.values, ...merged });
      toast.info('Recuperamos o preenchimento anterior.');
    }
    // Executa apenas uma vez, na montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Primeiro passo: valida e abre a conferencia.
   * Nada e salvo e nenhuma consulta acontece aqui.
   */
  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submittedRef.current || submitting) return;

    const values = form.validate();
    if (!values) {
      toast.error('Revise os campos destacados antes de enviar.');
      const firstError = document.querySelector('[aria-invalid="true"], [role="alert"]');
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setConfirming(true);
  }

  /** Segundo passo: envio, apos a confirmacao explicita. */
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

      draft.clear();
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
          // A senha sai da memoria assim que a tela muda.
          setAccess(null);
          setDone(false);
        }}
      />
    );
  }

  return (
    <main className="safe-x min-h-dvh bg-surface-muted pb-10">
      <header className="safe-top border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-lg items-center gap-3 px-4 py-4">
          <Avatar name={client.name} src={client.photo} size="md" />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-ink-900">{client.name}</p>
            <p className="truncate text-sm text-ink-500">Cadastro de equipe</p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-lg px-4 py-5">
        {client.form.introText ? (
          <p className="mb-5 animate-rise rounded-card border border-line bg-surface p-4 text-sm text-ink-700">
            {client.form.introText}
          </p>
        ) : null}

        <form
          onSubmit={handleSubmit}
          noValidate
          className="animate-rise space-y-5 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5"
        >
          <LocationProvider fields={fields} values={form.values} setValue={form.setValue}>
            {fields.map((field) => (
              <DynamicFieldInput
                key={field.id}
                field={field}
                idPrefix="publico"
                allowCamera
                disabled={submitting}
                value={form.values[field.id] ?? null}
                error={form.errors[field.id]}
                onChange={(value) => form.setValue(field.id, value)}
                onImageError={(message) => toast.error(message)}
              />
            ))}
          </LocationProvider>

          {privacy.enabled ? (
            <section
              aria-labelledby="aviso-privacidade"
              className="rounded-control border border-line bg-ink-50 p-3"
            >
              <h2
                id="aviso-privacidade"
                className="flex items-center gap-2 text-sm font-semibold text-ink-900"
              >
                <ShieldCheck aria-hidden="true" className="size-4 text-brand-700" />
                {privacy.title}
              </h2>
              <p className="mt-1.5 text-xs whitespace-pre-line text-ink-700">{privacy.text}</p>
              <p className="mt-1.5 text-xs text-ink-700">{DEVICE_NOTICE}</p>

              {privacy.requireConsent ? (
                <>
                  <Checkbox
                    id="publico-consentimento"
                    className="mt-1"
                    label={privacy.consentLabel}
                    checked={form.values[CONSENT_KEY] === true}
                    disabled={submitting}
                    onChange={(event) => form.setValue(CONSENT_KEY, event.target.checked)}
                  />
                  {form.errors[CONSENT_KEY] ? (
                    <p role="alert" className="text-xs font-medium text-danger-600">
                      {form.errors[CONSENT_KEY]}
                    </p>
                  ) : null}
                </>
              ) : null}
            </section>
          ) : null}

          <Button type="submit" size="lg" fullWidth loading={submitting}>
            {!submitting ? <Send aria-hidden="true" className="size-4" /> : null}
            {submitting ? 'Enviando...' : 'Enviar cadastro'}
          </Button>

          <p className="text-center text-xs text-ink-500">
            Seu preenchimento fica salvo neste aparelho até o envio.
          </p>

          <p className="text-center text-xs text-ink-500">{DEVICE_NOTICE}</p>
        </form>

        <ConfirmSubmissionModal
          open={confirming}
          config={client.form}
          values={form.values}
          submitting={submitting}
          onCancel={() => setConfirming(false)}
          onConfirm={handleConfirm}
        />

        <p className="mt-6 text-center text-xs text-ink-400">{appConfig.shortName}</p>
      </div>
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
    <main className="safe-x flex min-h-dvh items-center justify-center bg-surface-muted px-4 py-12">
      <div className="w-full max-w-md animate-rise rounded-card border border-line bg-surface p-6 text-center shadow-card sm:p-8">
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

        <p className="mt-6 text-xs text-ink-400">{appConfig.shortName}</p>
      </div>
    </main>
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
