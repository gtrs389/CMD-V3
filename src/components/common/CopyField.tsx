'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyText } from '@/lib/utils/clipboard';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

interface CopyFieldProps {
  value: string;
  label: string;
  /** Texto do botao. */
  actionLabel?: string;
}

/** Campo somente leitura com copia para a area de transferencia. */
export function CopyField({ value, label, actionLabel = 'Copiar' }: CopyFieldProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyText(value);
    if (!ok) {
      toast.error('Nao foi possivel copiar. Selecione o texto manualmente.');
      return;
    }
    setCopied(true);
    toast.success('Link copiado.');
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        readOnly
        value={value}
        aria-label={label}
        onFocus={(event) => event.currentTarget.select()}
        className="min-h-11 w-full min-w-0 rounded-control border border-line-strong bg-ink-50 px-3 font-mono text-xs text-ink-700 sm:text-sm"
      />
      <Button variant="secondary" onClick={handleCopy} className="shrink-0">
        {copied ? (
          <Check aria-hidden="true" className="size-4 text-success-600" />
        ) : (
          <Copy aria-hidden="true" className="size-4" />
        )}
        {copied ? 'Copiado' : actionLabel}
      </Button>
    </div>
  );
}
