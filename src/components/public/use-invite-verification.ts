'use client';

import { useCallback, useRef, useState } from 'react';
import { lookupInviteCpf, lookupInviteTitulo } from '@/lib/repositories';

export type PendingConfirmation = { kind: 'cpf' | 'titulo'; value: string } | null;

interface UseInviteVerificationOptions {
  token: string;
  /** Corrige o campo "Nome completo" silenciosamente, sem avisar a pessoa. */
  onNameCorrection: (nome: string) => void;
  /** Preenche zona e secao com o que a consulta eleitoral devolveu. */
  onZonaSecaoFilled: (zona: string | null, secao: string | null) => void;
}

/**
 * Confirmacao de CPF e titulo de eleitor, em tempo real, durante o
 * preenchimento do link publico.
 *
 * A pessoa confirma cada numero antes de seguir; a consulta acontece so
 * depois da confirmacao, nunca aparece como "consulta" na tela, e falha
 * nunca trava o cadastro — so deixa de corrigir o nome ou de preencher zona
 * e secao sozinha.
 *
 * Trocar o CPF depois de ja ter confirmado o titulo invalida a confirmacao
 * do titulo: zona e secao eram do CPF antigo e deixam de valer.
 */
export function useInviteVerification({
  token,
  onNameCorrection,
  onZonaSecaoFilled,
}: UseInviteVerificationOptions) {
  const [pending, setPending] = useState<PendingConfirmation>(null);
  const [loading, setLoading] = useState(false);

  const cpfTokenRef = useRef<string | null>(null);
  const tseTokenRef = useRef<string | null>(null);
  const confirmedCpfRef = useRef<string | null>(null);
  const confirmedTituloRef = useRef<string | null>(null);

  const requestCpfConfirmation = useCallback((digits: string) => {
    if (digits === confirmedCpfRef.current) return;
    setPending({ kind: 'cpf', value: digits });
  }, []);

  const requestTituloConfirmation = useCallback((digits: string) => {
    if (digits === confirmedTituloRef.current) return;
    setPending({ kind: 'titulo', value: digits });
  }, []);

  const cancel = useCallback(() => setPending(null), []);

  const confirm = useCallback(async () => {
    if (!pending) return;
    const { kind, value } = pending;
    setPending(null);
    setLoading(true);

    try {
      if (kind === 'cpf') {
        const changed = confirmedCpfRef.current !== null && confirmedCpfRef.current !== value;
        confirmedCpfRef.current = value;

        if (changed) {
          // O titulo confirmado antes era do CPF anterior: zona e secao
          // deixam de valer ate a pessoa confirmar o titulo de novo.
          confirmedTituloRef.current = null;
          tseTokenRef.current = null;
          onZonaSecaoFilled(null, null);
        }

        const result = await lookupInviteCpf(token, value).catch(() => ({
          nome: null,
          token: null,
        }));
        cpfTokenRef.current = result.token;
        if (result.nome) onNameCorrection(result.nome);
      } else {
        confirmedTituloRef.current = value;

        const result = await lookupInviteTitulo(token, cpfTokenRef.current).catch(() => ({
          zona: null,
          secao: null,
          token: null,
        }));
        tseTokenRef.current = result.token;
        onZonaSecaoFilled(result.zona, result.secao);
      }
    } finally {
      setLoading(false);
    }
  }, [pending, token, onNameCorrection, onZonaSecaoFilled]);

  const getTokens = useCallback(
    () => ({ cpfToken: cpfTokenRef.current, tseToken: tseTokenRef.current }),
    [],
  );

  return { pending, loading, requestCpfConfirmation, requestTituloConfirmation, cancel, confirm, getTokens };
}
