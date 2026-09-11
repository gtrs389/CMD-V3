'use client';

import { ShieldCheck } from 'lucide-react';
import type { ClientFormConfig } from '@/lib/types';
import { Checkbox } from '@/components/ui/Checkbox';

interface InvitePrivacyNoticeProps {
  config: ClientFormConfig;
  accepted: boolean;
  disabled: boolean;
  error?: string;
  onChange: (accepted: boolean) => void;
  /** Aviso curto sobre os sinais tecnicos registrados no envio. */
  deviceNotice: string;
}

/**
 * Aviso de privacidade e aceite, no fim do formulario.
 *
 * Fica na mesma pagina dos campos, logo acima do envio: com o cadastro
 * inteiro em uma tela so, o aceite precisa estar onde a pessoa termina de
 * preencher. O texto e o rotulo do aceite sao os que o ADMIN escreveu.
 *
 * Sem aviso configurado sobra apenas a frase dos sinais tecnicos, que vale
 * sempre.
 */
export function InvitePrivacyNotice({
  config,
  accepted,
  disabled,
  error,
  onChange,
  deviceNotice,
}: InvitePrivacyNoticeProps) {
  const { privacy } = config;

  if (!privacy.enabled) return <p className="text-xs text-ink-500">{deviceNotice}</p>;

  return (
    <section
      aria-labelledby="aviso-privacidade"
      className="rounded-card border border-line bg-ink-50 p-3.5"
    >
      <h2
        id="aviso-privacidade"
        className="flex items-center gap-2 text-[0.8125rem] font-semibold text-ink-900"
      >
        <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-brand-700" />
        {privacy.title}
      </h2>

      <p className="mt-1.5 text-xs whitespace-pre-line text-ink-700">{privacy.text}</p>
      <p className="mt-1.5 text-xs text-ink-700">{deviceNotice}</p>

      {privacy.requireConsent ? (
        <>
          <Checkbox
            id="publico-consentimento"
            className="mt-1"
            label={privacy.consentLabel}
            checked={accepted}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            onChange={(event) => onChange(event.target.checked)}
          />
          {error ? (
            <p role="alert" className="text-xs font-medium text-danger-600">
              {error}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
