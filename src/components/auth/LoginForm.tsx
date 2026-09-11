'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/auth/client';
import { DEFAULT_AUTHENTICATED_PATH, homePathFor } from '@/lib/auth/constants';
import { useHydrated } from '@/hooks/use-hydrated';
import styles from './login.module.css';

interface LoginFormProps {
  /** Caminho interno para onde voltar apos entrar. */
  next?: string;
  /** Indica que o servidor esta sem as variaveis do Supabase. */
  configured: boolean;
  /** Chegou aqui logo depois de trocar a senha. */
  senhaAlterada?: boolean;
}

/** Icone de alerta das mensagens de erro. */
function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.2v.3" strokeLinecap="round" />
    </svg>
  );
}

export function LoginForm({ next, configured, senhaAlterada = false }: LoginFormProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  function togglePassword() {
    setShowPassword((current) => !current);
    passwordRef.current?.focus({ preventScroll: true });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Mesma checagem do HTML original: o navegador aponta o campo em falta.
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const data = new FormData(form);
    const email = String(data.get('email') ?? '');
    const password = String(data.get('password') ?? '');

    setPending(true);
    setFormError(null);
    setStatus('Validando acesso.');

    const result = await login(email, password);
    if (!result.ok) {
      const message = result.message ?? 'Não foi possível entrar.';
      setPending(false);
      setFormError(message);
      setStatus(message);
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

    // `pending` segue ligado: o botao continua carregando ate a troca de tela.
    setStatus('Acesso liberado. Redirecionando.');
    router.replace(blocked ? home : (next ?? home));
    router.refresh();
  }

  return (
    <form
      id="login-form"
      onSubmit={handleSubmit}
      noValidate
      /* `method="post"` protege o caso extremo de um envio nativo acontecer
         antes da hidratacao: as credenciais nunca vao para a barra de enderecos. */
      method="post"
    >
      {senhaAlterada && !formError ? (
        <p className={`${styles['form-alert']} ${styles['form-alert--success']}`} role="status">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="m8.4 12.3 2.5 2.5 4.7-5.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Senha alterada com sucesso. Entre novamente.</span>
        </p>
      ) : null}

      {formError ? (
        <p className={styles['form-alert']} role="alert">
          <AlertIcon />
          <span>{formError}</span>
        </p>
      ) : null}

      {!configured ? (
        <p className={styles['form-alert']} role="status">
          <AlertIcon />
          <span>
            <strong>Servidor sem banco de dados</strong>
            Defina SUPABASE_URL e SUPABASE_SECRET_KEY no ambiente do servidor. Enquanto isso,
            nenhum login é aceito.
          </span>
        </p>
      ) : null}

      <div className={styles.field} style={{ '--delay': '.76s' } as React.CSSProperties}>
        <label htmlFor="email">E-mail</label>
        <div className={styles['input-wrap']}>
          <svg
            className={styles['input-icon']}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m4 7 8 6 8-6" />
          </svg>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="seuemail@exemplo.com"
            required
            aria-describedby="form-status"
          />
        </div>
      </div>

      <div className={styles.field} style={{ '--delay': '.84s' } as React.CSSProperties}>
        <label htmlFor="password">Senha</label>
        <div className={styles['input-wrap']}>
          <svg
            className={styles['input-icon']}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <rect x="5" y="10" width="14" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
          </svg>
          <input
            ref={passwordRef}
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Digite sua senha"
            required
            minLength={8}
            aria-describedby="form-status"
          />
          <button
            className={styles['password-toggle']}
            type="button"
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={showPassword}
            onClick={togglePassword}
          >
            <svg
              className={styles['eye-on']}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
              <circle cx="12" cy="12" r="2.6" />
            </svg>
            <svg
              className={styles['eye-off']}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="m3 3 18 18M10.6 6.15A9.9 9.9 0 0 1 12 6c6 0 9.5 6 9.5 6a15.9 15.9 0 0 1-2.1 2.75M6.25 6.25C3.82 8 2.5 12 2.5 12s3.5 6 9.5 6a9.7 9.7 0 0 0 3.1-.5M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            </svg>
          </button>
        </div>
      </div>

      <button
        className={`${styles['submit-button']}${pending ? ` ${styles['is-loading']}` : ''}`}
        type="submit"
        disabled={pending || !hydrated}
      >
        <span className={styles['button-inner']}>
          <span className={styles.spinner} aria-hidden="true" />
          <span className={styles['button-label']}>
            {pending ? 'Entrando…' : 'Entrar no sistema'}
          </span>
          <svg
            className={styles['button-arrow']}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M5 12h14M14 6l6 6-6 6" />
          </svg>
        </span>
      </button>
      <p id="form-status" className={styles['sr-only']} aria-live="polite">
        {status}
      </p>
    </form>
  );
}
