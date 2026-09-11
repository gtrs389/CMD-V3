'use client';

import { useState } from 'react';
import { Check, Copy, KeyRound, ShieldAlert } from 'lucide-react';
import type { GeneratedCredential } from '@/lib/types';
import { copyText } from '@/lib/utils/clipboard';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

interface CredentialsModalProps {
  open: boolean;
  credentials: GeneratedCredential[];
  /** Times ignorados porque o e-mail pertence a outro usuario. */
  conflicts?: { name: string; email: string }[];
  /** Aviso quando nenhum acesso pode ser criado. */
  message?: string | null;
  onClose: () => void;
}

/**
 * Credenciais recem-geradas.
 *
 * A senha existe apenas aqui, no estado desta tela, e some ao fechar. Ela
 * nunca vai para o banco, para log, para a URL ou para o armazenamento do
 * navegador: o banco guarda somente o hash scrypt.
 */
export function CredentialsModal({
  open,
  credentials,
  conflicts = [],
  message = null,
  onClose,
}: CredentialsModalProps) {
  const toast = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(label: string, value: string, key: string) {
    const ok = await copyText(value);
    if (!ok) {
      toast.error('Não foi possível copiar. Selecione o texto manualmente.');
      return;
    }
    setCopied(key);
    toast.success(`${label} copiado.`);
    window.setTimeout(() => setCopied((state) => (state === key ? null : state)), 2000);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Acesso gerado"
      description="Copie e envie agora: a senha não será exibida novamente."
      footer={<Button onClick={onClose}>Concluir</Button>}
    >
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-control border border-warning-50 bg-warning-50 px-3 py-2.5 text-sm text-warning-600">
          <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">
            A senha temporária aparece uma única vez. Se fechar sem copiar, gere outra em
            Configurações.
          </span>
        </p>

        {message ? (
          <p className="rounded-control border border-danger-200 bg-danger-50 px-3 py-2.5 text-sm font-medium text-danger-700">
            {message}
          </p>
        ) : null}

        {credentials.length === 0 && !message ? (
          <p className="text-sm text-ink-500">Nenhum acesso novo foi gerado.</p>
        ) : (
          <ul className="space-y-3">
            {credentials.map((credential) => (
              <li
                key={credential.userId}
                className="rounded-control border border-line bg-ink-50 p-3"
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                  <KeyRound aria-hidden="true" className="size-4 shrink-0 text-brand-700" />
                  {credential.name}
                </p>

                <dl className="mt-2 space-y-2">
                  {credential.email ? (
                    <Linha
                      label="E-mail"
                      value={credential.email}
                      copied={copied === `${credential.userId}-email`}
                      onCopy={() =>
                        copy('E-mail', credential.email ?? '', `${credential.userId}-email`)
                      }
                    />
                  ) : null}
                  <Linha
                    label="Senha temporária"
                    value={credential.password}
                    copied={copied === `${credential.userId}-senha`}
                    onCopy={() =>
                      copy('Senha', credential.password, `${credential.userId}-senha`)
                    }
                  />
                </dl>
              </li>
            ))}
          </ul>
        )}

        {conflicts.length > 0 ? (
          <div className="rounded-control border border-danger-200 bg-danger-50 p-3">
            <p className="text-sm font-semibold text-danger-700">
              E-mail já utilizado por outro usuário
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-danger-700">
              {conflicts.map((item) => (
                <li key={item.email}>
                  {item.name} — {item.email}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function Linha({
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
