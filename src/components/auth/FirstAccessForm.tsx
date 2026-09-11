'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { firstAccessSchema, PASSWORD_MIN } from '@/lib/validation/auth.schema';
import { DEFAULT_AUTHENTICATED_PATH } from '@/lib/auth/constants';
import { Button } from '@/components/ui/Button';
import { Field, describedBy } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';

type Campo = 'newPassword' | 'confirmPassword';

const CAMPOS: Array<{ id: Campo; label: string; help?: string }> = [
  { id: 'newPassword', label: 'Nova senha', help: `Pelo menos ${PASSWORD_MIN} caracteres.` },
  { id: 'confirmPassword', label: 'Confirmar nova senha' },
];

const VAZIO = { newPassword: '', confirmPassword: '' };

/**
 * Definicao da senha definitiva.
 *
 * O usuario vem da sessao: nada identifica a conta neste formulario. Ao
 * final, as demais sessoes caem e apenas esta continua valida.
 */
export function FirstAccessForm() {
  const router = useRouter();
  const [values, setValues] = useState(VAZIO);
  const [errors, setErrors] = useState<Partial<Record<Campo, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<Campo, boolean>>({
    newPassword: false,
    confirmPassword: false,
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    setFormError(null);
    const parsed = firstAccessSchema.safeParse(values);

    if (!parsed.success) {
      const found: Partial<Record<Campo, string>> = {};
      for (const issue of parsed.error.issues) {
        const campo = issue.path[0] as Campo;
        if (campo && !found[campo]) found[campo] = issue.message;
      }
      setErrors(found);
      return;
    }

    setErrors({});
    setSaving(true);

    try {
      const response = await fetch('/api/auth/primeiro-acesso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const data = (await response.json().catch(() => ({}))) as {
        candidateId?: string | null;
        message?: string;
      };

      if (!response.ok) {
        setFormError(data.message ?? 'Não foi possível definir a senha.');
        return;
      }

      // A senha digitada nao sobrevive ao envio.
      setValues(VAZIO);
      router.replace(
        data.candidateId ? `/candidatos/${data.candidateId}` : DEFAULT_AUTHENTICATED_PATH,
      );
      router.refresh();
    } catch {
      setFormError('Falha de conexão. Verifique sua rede e tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate method="post" className="mt-6 space-y-4">
      {formError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-control border border-danger-200 bg-danger-50 px-3 py-2.5 text-sm text-danger-700"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">{formError}</span>
        </div>
      ) : null}

      {CAMPOS.map((campo) => (
        <Field
          key={campo.id}
          id={campo.id}
          label={campo.label}
          required
          help={campo.help}
          error={errors[campo.id]}
        >
          <div className="relative">
            <Input
              id={campo.id}
              type={visible[campo.id] ? 'text' : 'password'}
              autoComplete="new-password"
              value={values[campo.id]}
              invalid={Boolean(errors[campo.id])}
              onChange={(event) =>
                setValues((state) => ({ ...state, [campo.id]: event.target.value }))
              }
              aria-describedby={describedBy(campo.id, campo.help, errors[campo.id])}
              className="pr-12"
            />
            <IconButton
              label={visible[campo.id] ? 'Ocultar senha' : 'Mostrar senha'}
              icon={visible[campo.id] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              onClick={() => setVisible((state) => ({ ...state, [campo.id]: !state[campo.id] }))}
              className="absolute inset-y-0 right-1 my-auto"
            />
          </div>
        </Field>
      ))}

      <Button type="submit" fullWidth loading={saving}>
        {!saving ? <ShieldCheck aria-hidden="true" className="size-4" /> : null}
        Definir senha e continuar
      </Button>
    </form>
  );
}
