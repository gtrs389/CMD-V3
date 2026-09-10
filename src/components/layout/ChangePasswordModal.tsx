'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { PASSWORD_MIN, changePasswordSchema } from '@/lib/validation/auth.schema';
import { LOGIN_PATH } from '@/lib/auth/constants';
import { Button } from '@/components/ui/Button';
import { Field, describedBy } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

type CampoSenha = 'currentPassword' | 'newPassword' | 'confirmPassword';

const CAMPOS: Array<{ id: CampoSenha; label: string; autoComplete: string; help?: string }> = [
  { id: 'currentPassword', label: 'Senha atual', autoComplete: 'current-password' },
  {
    id: 'newPassword',
    label: 'Nova senha',
    autoComplete: 'new-password',
    help: `Pelo menos ${PASSWORD_MIN} caracteres.`,
  },
  { id: 'confirmPassword', label: 'Confirmar nova senha', autoComplete: 'new-password' },
];

const VAZIO = { currentPassword: '', newPassword: '', confirmPassword: '' };

/**
 * Troca da propria senha.
 *
 * O servidor identifica o usuario pela sessao: nenhum identificador e enviado
 * daqui. Depois da troca, todas as sessoes sao encerradas e a pessoa volta
 * para a tela de entrada.
 */
export function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const router = useRouter();
  const [values, setValues] = useState(VAZIO);
  const [errors, setErrors] = useState<Partial<Record<CampoSenha, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<CampoSenha, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [saving, setSaving] = useState(false);

  // Nada do que foi digitado sobrevive ao fechamento, por qualquer caminho:
  // botao, tecla Escape ou clique no fundo passam por aqui.
  const fechar = useCallback(() => {
    setValues(VAZIO);
    setErrors({});
    setFormError(null);
    setVisible({ currentPassword: false, newPassword: false, confirmPassword: false });
    onClose();
  }, [onClose]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    setFormError(null);

    const parsed = changePasswordSchema.safeParse(values);
    if (!parsed.success) {
      const proximos: Partial<Record<CampoSenha, string>> = {};
      for (const issue of parsed.error.issues) {
        const campo = issue.path[0] as CampoSenha | undefined;
        if (campo && !proximos[campo]) proximos[campo] = issue.message;
      }
      setErrors(proximos);
      return;
    }

    setErrors({});
    setSaving(true);

    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(parsed.data),
      });

      const data = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        setFormError(data.message ?? 'Não foi possível alterar a senha.');
        return;
      }

      // A sessao ja foi encerrada no servidor: seguimos direto para o login.
      router.replace(`${LOGIN_PATH}?senha=alterada`);
      router.refresh();
    } catch {
      setFormError('Falha de conexão. Verifique sua rede e tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Alterar senha"
      description="Ao concluir, todas as sessões abertas serão encerradas e você entrará novamente."
      size="sm"
      busy={saving}
      footer={
        <>
          <Button variant="secondary" disabled={saving} onClick={fechar}>
            Cancelar
          </Button>
          <Button type="submit" form="form-alterar-senha" loading={saving}>
            Alterar senha
          </Button>
        </>
      }
    >
      <form id="form-alterar-senha" onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-control border border-danger-200 bg-danger-50 px-3 py-2.5 text-sm text-danger-700"
          >
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">{formError}</span>
          </div>
        ) : null}

        {CAMPOS.map((campo) => {
          const mostrando = visible[campo.id];
          return (
            <Field
              key={campo.id}
              id={campo.id}
              label={campo.label}
              help={campo.help}
              required
              error={errors[campo.id]}
            >
              <Input
                id={campo.id}
                type={mostrando ? 'text' : 'password'}
                autoComplete={campo.autoComplete}
                value={values[campo.id]}
                disabled={saving}
                invalid={Boolean(errors[campo.id])}
                aria-describedby={describedBy(campo.id, campo.help, errors[campo.id])}
                onChange={(event) =>
                  setValues((atual) => ({ ...atual, [campo.id]: event.target.value }))
                }
                trailing={
                  <IconButton
                    label={mostrando ? `Ocultar ${campo.label}` : `Mostrar ${campo.label}`}
                    icon={
                      mostrando ? <EyeOff className="size-5" /> : <Eye className="size-5" />
                    }
                    tabIndex={-1}
                    onClick={() =>
                      setVisible((atual) => ({ ...atual, [campo.id]: !atual[campo.id] }))
                    }
                  />
                }
              />
            </Field>
          );
        })}
      </form>
    </Modal>
  );
}
