'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Eye, EyeOff, LogIn } from 'lucide-react';
import { loginSchema, type LoginInput } from '@/lib/validation/auth.schema';
import { login } from '@/lib/auth/client';
import { DEFAULT_AUTHENTICATED_PATH, homePathFor } from '@/lib/auth/constants';
import { useHydrated } from '@/hooks/use-hydrated';
import { Button } from '@/components/ui/Button';
import { Field, describedBy } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { IconButton } from '@/components/ui/IconButton';

interface LoginFormProps {
  /** Caminho interno para onde voltar apos entrar. */
  next?: string;
  /** Indica que o servidor esta sem as variaveis do Supabase. */
  configured: boolean;
}

export function LoginForm({ next, configured }: LoginFormProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginInput) {
    setFormError(null);

    const result = await login(values.email, values.password);
    if (!result.ok) {
      setFormError(result.message ?? 'Não foi possível entrar.');
      return;
    }

    // Senha temporaria leva ao primeiro acesso; candidato, ao proprio
    // cadastro; equipe, a "Minha mobilizacao". O destino pedido na URL so
    // vale para quem ja pode navegar livremente.
    const home = result.user ? homePathFor(result.user) : DEFAULT_AUTHENTICATED_PATH;
    const blocked =
      result.user?.mustChangePassword ||
      result.user?.role === 'CANDIDATE' ||
      result.user?.role === 'EQUIPE';

    router.replace(blocked ? home : (next ?? home));
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      /* `method="post"` protege o caso extremo de um envio nativo acontecer
         antes da hidratacao: as credenciais nunca vao para a barra de enderecos. */
      method="post"
      className="mt-6 space-y-4"
    >
      {formError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-control border border-danger-200 bg-danger-50 px-3 py-2.5 text-sm text-danger-700"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">{formError}</span>
        </div>
      ) : null}

      <Field id="email" label="E-mail" required error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="você@exemplo.com"
          invalid={Boolean(errors.email)}
          aria-describedby={describedBy('email', undefined, errors.email?.message)}
          {...register('email')}
        />
      </Field>

      <Field id="password" label="Senha" required error={errors.password?.message}>
        <Input
          id="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="Digite sua senha"
          invalid={Boolean(errors.password)}
          aria-describedby={describedBy('password', undefined, errors.password?.message)}
          trailing={
            <IconButton
              label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              icon={showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              onClick={() => setShowPassword((current) => !current)}
              tabIndex={-1}
            />
          }
          {...register('password')}
        />
      </Field>

      <Button
        type="submit"
        fullWidth
        size="lg"
        loading={isSubmitting || !hydrated}
        disabled={!hydrated}
      >
        {!isSubmitting && hydrated ? <LogIn aria-hidden="true" className="size-4" /> : null}
        Entrar
      </Button>

      {!configured ? (
        <div
          role="status"
          className="rounded-control border border-danger-200 bg-danger-50 px-3 py-3 text-xs text-danger-700"
        >
          <p className="font-semibold">Servidor sem banco de dados</p>
          <p className="mt-1">
            Defina SUPABASE_URL e SUPABASE_SECRET_KEY no ambiente do servidor. Enquanto isso,
            nenhum login é aceito.
          </p>
        </div>
      ) : null}
    </form>
  );
}
