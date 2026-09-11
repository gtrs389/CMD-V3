'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionUser } from '@/lib/types';
import { homePathFor } from '@/lib/auth/constants';
import { maskPhone } from '@/lib/utils/phone';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

/**
 * Entrada do Administrador do time: somente o telefone.
 *
 * O telefone nao e senha — sozinho ele nao autentica ninguem. Quem diz de
 * qual time se trata e o link, e a conferencia acontece inteira no servidor.
 * A tela nunca revela se o telefone existe, se esta inativo ou se pertence a
 * outro time: a resposta e sempre a mesma.
 */
export function TeamAccessForm({ token }: { token: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);

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
        setPending(false);
        setError(data?.message ?? 'Não foi possível entrar.');
        return;
      }

      // O painel e o mesmo de sempre: o administrador cai na pagina do time.
      router.replace(homePathFor(data.user));
      router.refresh();
    } catch {
      setPending(false);
      setError('Não foi possível entrar. Tente novamente.');
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
      {error ? (
        <p
          role="alert"
          className="rounded-control border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
        >
          {error}
        </p>
      ) : null}

      <Field id="acesso-telefone" label="Número de telefone" required>
        <Input
          id="acesso-telefone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="(00) 00000-0000"
          value={phone}
          onChange={(event) => setPhone(maskPhone(event.target.value))}
        />
      </Field>

      <Button type="submit" fullWidth loading={pending}>
        Acessar meu time
      </Button>
    </form>
  );
}
