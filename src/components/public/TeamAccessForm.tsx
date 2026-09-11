'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionUser } from '@/lib/types';
import { homePathFor } from '@/lib/auth/constants';
import { maskPhone } from '@/lib/utils/phone';
import { useHydrated } from '@/hooks/use-hydrated';
import styles from '@/components/auth/login.module.css';

/**
 * Entrada do Administrador do time: somente o telefone.
 *
 * Mesma estrutura do formulario de login — so o campo muda. O telefone nao e
 * senha: sozinho ele nao autentica ninguem. Quem diz de qual time se trata e
 * o link, e a conferencia acontece inteira no servidor. A tela nunca revela
 * se o telefone existe, se esta inativo ou se pertence a outro time: a
 * resposta e sempre a mesma.
 */

/** Icone de alerta das mensagens de erro. Igual ao do login. */
function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.2v.3" strokeLinecap="round" />
    </svg>
  );
}

export function TeamAccessForm({ token }: { token: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [phone, setPhone] = useState('');
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setFormError(null);
    setStatus('Validando acesso.');

    try {
      const response = await fetch(`/api/acesso-time/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      const data = (await response.json().catch(() => null)) as
        | { user?: SessionUser; message?: string }
        | null;

      if (!response.ok || !data?.user) {
        const message = data?.message ?? 'Não foi possível entrar.';
        setPending(false);
        setFormError(message);
        setStatus(message);
        return;
      }

      // `pending` segue ligado: o botao continua carregando ate a troca de
      // tela. O painel e o mesmo de sempre: o administrador cai na pagina
      // do proprio time.
      setStatus('Acesso liberado. Redirecionando.');
      router.replace(homePathFor(data.user));
      router.refresh();
    } catch {
      const message = 'Não foi possível entrar. Tente novamente.';
      setPending(false);
      setFormError(message);
      setStatus(message);
    }
  }

  return (
    <form
      id="acesso-time-form"
      onSubmit={handleSubmit}
      noValidate
      /* `method="post"` protege o caso extremo de um envio nativo acontecer
         antes da hidratacao: o telefone nunca vai para a barra de enderecos. */
      method="post"
    >
      {formError ? (
        <p className={styles['form-alert']} role="alert">
          <AlertIcon />
          <span>{formError}</span>
        </p>
      ) : null}

      <div className={styles.field} style={{ '--delay': '.76s' } as React.CSSProperties}>
        <label htmlFor="telefone">Número de telefone</label>
        <div className={styles['input-wrap']}>
          <svg
            className={styles['input-icon']}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M6.5 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5Z" />
            <path d="M10.5 17.5h3" strokeLinecap="round" />
          </svg>
          <input
            id="telefone"
            name="telefone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder=""
            required
            value={phone}
            onChange={(event) => setPhone(maskPhone(event.target.value))}
            aria-describedby="form-status"
          />
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
            {pending ? 'Entrando…' : 'Acessar meu time'}
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
