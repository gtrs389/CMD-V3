'use client';

import { useState } from 'react';
import { PlugZap } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface AccessBlockedDialogProps {
  /** Texto vindo do servidor: quem sabe o motivo é quem escreve a mensagem. */
  message: string;
  onLeave: () => Promise<void>;
}

/**
 * Aviso de conta desconectada.
 *
 * Aparece quando a sessão ainda existe, mas deixou de valer — hoje, quando o
 * ADMIN geral desliga o acesso do Time DEMO. Cobre a tela inteira de
 * propósito: o que estava embaixo não responde mais, e deixar a pessoa
 * clicando em botões mortos é pior do que dizer o que aconteceu.
 *
 * Não leva para o login sozinho. Sumir sem explicação é exatamente o que faz
 * alguém achar que o sistema quebrou — e, se o acesso for religado, a tela se
 * recompõe e a pessoa continua de onde parou, sem ter feito nada.
 */
export function AccessBlockedDialog({ message, onLeave }: AccessBlockedDialogProps) {
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    try {
      await onLeave();
    } finally {
      setSaindo(false);
    }
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="acesso-desligado-titulo"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/70 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-card bg-surface p-6 text-center shadow-card">
        <span
          aria-hidden="true"
          className="mx-auto flex size-12 items-center justify-center rounded-full bg-ink-100 text-ink-500"
        >
          <PlugZap className="size-6" />
        </span>

        <h2 id="acesso-desligado-titulo" className="mt-4 text-lg font-bold text-ink-900">
          Conta desconectada
        </h2>

        <p className="mt-2 text-sm text-ink-600">{message}</p>

        <p className="mt-2 text-xs text-ink-500">
          Se o acesso for religado, esta tela volta sozinha.
        </p>

        <Button className="mt-5" fullWidth onClick={sair} loading={saindo}>
          Sair
        </Button>
      </div>
    </div>
  );
}
