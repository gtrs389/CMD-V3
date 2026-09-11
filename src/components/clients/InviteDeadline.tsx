'use client';

import { useEffect, useState } from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import type { Invite } from '@/lib/types';
import {
  countdownLabel,
  effectiveState,
  inviteIsLive,
  INVITE_STATE_LABELS,
} from '@/lib/domain/invite-expiration';
import { formatDateTime } from '@/lib/utils/date';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/Button';

interface InviteDeadlineProps {
  invite: Invite;
  /** Gera um novo link. Ausente quando o perfil nao pode renovar. */
  onRenew?: () => void;
  renewing?: boolean;
  className?: string;
}

/**
 * Prazo do link, ao lado do endereco.
 *
 * Mostra o estado (Ativo ou Expirado), o horario exato do fim do prazo e a
 * contagem regressiva. A contagem e APENAS informativa: quem autoriza e o
 * servidor, comparando com o proprio relogio a cada requisicao. Link fora do
 * prazo nunca aparece como ativo.
 */
export function InviteDeadline({ invite, onRenew, renewing = false, className }: InviteDeadlineProps) {
  // Releitura periodica para a contagem andar sem recarregar a pagina.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const live = inviteIsLive(invite, now);
  const state = invite.active ? effectiveState(invite.state, invite.expiresAt, now) : 'REVOKED';
  const remaining = new Date(invite.expiresAt).getTime() - now;
  const countdown = live ? countdownLabel(remaining) : '';

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-pill px-2 py-1 text-[0.6875rem] font-semibold',
          live ? 'bg-success-50 text-success-600' : 'bg-danger-50 text-danger-600',
        )}
      >
        <span
          aria-hidden="true"
          className={cn('size-1.5 rounded-full', live ? 'bg-success-600' : 'bg-danger-600')}
        />
        {live ? 'Ativo' : INVITE_STATE_LABELS[state]}
      </span>

      <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-500">
        <Clock aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="min-w-0">
          {live ? (
            <>
              {countdown} · expira em {formatDateTime(invite.expiresAt)}
            </>
          ) : (
            <>Expirado em {formatDateTime(invite.expiresAt)}</>
          )}
        </span>
      </span>

      {!live && onRenew ? (
        <Button variant="secondary" size="sm" loading={renewing} onClick={onRenew}>
          {!renewing ? <RefreshCw aria-hidden="true" className="size-4" /> : null}
          Gerar novo link
        </Button>
      ) : null}
    </div>
  );
}
