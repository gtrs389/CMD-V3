'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Send, ShieldCheck } from 'lucide-react';
import { appConfig } from '@/config/app.config';
import type { Client } from '@/lib/types';
import { submitInvite } from '@/lib/repositories';
import { NetworkError } from '@/lib/repositories/http/api';
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
import { DynamicFieldInput } from '@/components/form-renderer/DynamicFieldInput';
import { useDynamicForm } from '@/components/form-renderer/use-dynamic-form';

/**
 * Aviso curto sobre os sinais tecnicos registrados no envio.
 * Aparece sempre, independente do aviso de privacidade do cliente.
 */
const DEVICE_NOTICE =
  'Ao enviar, registramos dados técnicos do aparelho e da conexão para segurança e prevenção de fraude.';

interface PublicFormViewProps {
  client: Client;
}

/**
 * Formulario publico de cadastro de equipe.
 *
 * Pensado para o celular: uma coluna, campos grandes, foto pela camera ou
 * galeria, rascunho preservado e protecao contra envio duplicado.
 */
export function PublicFormView({ client }: PublicFormViewProps) {
  const toast = useToast();
  const draft = useFormDraft<DynamicFormValues>(`convite.${client.invite.token}`);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // Barra multiplos cliques antes mesmo do estado do React atualizar.
    if (submittedRef.current || submitting) return;

    const values = form.validate();
    if (!values) {
      toast.error('Revise os campos destacados antes de enviar.');
      const firstError = document.querySelector('[aria-invalid="true"], [role="alert"]');
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    submittedRef.current = true;
    setSubmitting(true);

    try {
      const payload = toSubmission(client.form, values);
      // O cliente de destino vem do token do link, conferido no servidor.
      await submitInvite(client.invite.token ?? '', {
        name: payload.name,
        phone: payload.phone,
        photo: payload.photo,
        gender: payload.gender,
        cpf: payload.cpf,
        voterId: payload.voterId,
        state: payload.state,
        city: payload.city,
        district: payload.district,
        responses: payload.responses,
        consentAt: payload.consentAt,
      });

      draft.clear();
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
        onNew={() => {
          submittedRef.current = false;
          form.reset();
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

        <p className="mt-6 text-center text-xs text-ink-400">{appConfig.shortName}</p>
      </div>
    </main>
  );
}

interface SuccessScreenProps {
  client: Client;
  onNew: () => void;
}

function SuccessScreen({ client, onNew }: SuccessScreenProps) {
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

        <Button variant="secondary" fullWidth className="mt-6" onClick={onNew}>
          Cadastrar outra pessoa
        </Button>

        <p className="mt-6 text-xs text-ink-400">{appConfig.shortName}</p>
      </div>
    </main>
  );
}
