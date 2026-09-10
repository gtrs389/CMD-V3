'use client';

import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Client } from '@/lib/types';
import { clientRepository } from '@/lib/repositories';
import { formSettingsSchema, type FormSettingsValues } from '@/lib/validation/field.schema';
import { appConfig } from '@/config/app.config';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';

interface FormSettingsCardProps {
  client: Client;
}

function toValues(client: Client): FormSettingsValues {
  const { form } = client;
  return {
    introText: form.introText,
    successMessage: form.successMessage,
    privacyEnabled: form.privacy.enabled,
    privacyTitle: form.privacy.title,
    privacyText: form.privacy.text,
    privacyRequireConsent: form.privacy.requireConsent,
    privacyConsentLabel: form.privacy.consentLabel,
  };
}

/** Textos do formulario publico e area configuravel de privacidade. */
export function FormSettingsCard({ client }: FormSettingsCardProps) {
  const toast = useToast();

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormSettingsValues>({
    resolver: zodResolver(formSettingsSchema),
    defaultValues: toValues(client),
  });

  useEffect(() => {
    reset(toValues(client));
  }, [client, reset]);

  const privacyEnabled = useWatch({ control, name: 'privacyEnabled' });
  const requireConsent = useWatch({ control, name: 'privacyRequireConsent' });

  async function onSubmit(values: FormSettingsValues) {
    try {
      await clientRepository.updateForm(client.id, {
        introText: values.introText,
        successMessage: values.successMessage,
        privacy: {
          enabled: values.privacyEnabled,
          title: values.privacyTitle || appConfig.privacy.defaultTitle,
          text: values.privacyText,
          requireConsent: values.privacyRequireConsent,
          consentLabel: values.privacyConsentLabel || appConfig.privacy.defaultConsentLabel,
        },
      });
      toast.success('Ajustes do formulário salvos.');
    } catch {
      toast.error('Não foi possível salvar os ajustes.');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Textos do formulário</CardTitle>
            <CardDescription>Aparecem na página pública de cadastro.</CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <Field
            id="form-intro"
            label="Texto de abertura"
            help="Opcional. Explique rapidamente o que a pessoa está preenchendo."
            error={errors.introText?.message}
          >
            <Textarea
              id="form-intro"
              rows={3}
              placeholder="Ex.: Preencha seus dados para integrar a equipe."
              invalid={Boolean(errors.introText)}
              {...register('introText')}
            />
          </Field>

          <Field
            id="form-sucesso"
            label="Mensagem de sucesso"
            required
            help="Exibida na tela final, depois do envio."
            error={errors.successMessage?.message}
          >
            <Input
              id="form-sucesso"
              invalid={Boolean(errors.successMessage)}
              {...register('successMessage')}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Aviso de privacidade</CardTitle>
            <CardDescription>
              Área configurável. O texto padrão é apenas um marcador e deve ser revisado
              pelo responsável jurídico antes do uso real.
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <Switch
            label="Exibir aviso no formulário"
            description="Mostra o bloco de privacidade antes do botão de envio."
            checked={privacyEnabled}
            onChange={(checked) => setValue('privacyEnabled', checked, { shouldDirty: true })}
          />

          {privacyEnabled ? (
            <>
              <Field id="privacidade-titulo" label="Título" error={errors.privacyTitle?.message}>
                <Input
                  id="privacidade-titulo"
                  invalid={Boolean(errors.privacyTitle)}
                  {...register('privacyTitle')}
                />
              </Field>

              <Field
                id="privacidade-texto"
                label="Texto do aviso"
                help="Escreva o texto que será exibido a pessoa."
                error={errors.privacyText?.message}
              >
                <Textarea
                  id="privacidade-texto"
                  rows={6}
                  invalid={Boolean(errors.privacyText)}
                  {...register('privacyText')}
                />
              </Field>

              <Switch
                label="Exigir consentimento"
                description="A pessoa precisa marcar a confirmação para enviar o cadastro."
                checked={requireConsent}
                onChange={(checked) =>
                  setValue('privacyRequireConsent', checked, { shouldDirty: true })
                }
              />

              {requireConsent ? (
                <Field
                  id="privacidade-consentimento"
                  label="Texto da confirmação"
                  error={errors.privacyConsentLabel?.message}
                >
                  <Input
                    id="privacidade-consentimento"
                    invalid={Boolean(errors.privacyConsentLabel)}
                    {...register('privacyConsentLabel')}
                  />
                </Field>
              ) : null}
            </>
          ) : null}
        </CardBody>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="secondary"
          onClick={() => reset(toValues(client))}
          disabled={!isDirty || isSubmitting}
        >
          Descartar alterações
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Salvar ajustes
        </Button>
      </div>
    </form>
  );
}
