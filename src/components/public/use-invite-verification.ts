'use client';

import { useCallback, useRef, useState } from 'react';
import { lookupInviteCpf, lookupInviteTitulo } from '@/lib/repositories';

export type PendingConfirmation = { kind: 'cpf' | 'titulo'; value: string } | null;

interface UseInviteVerificationOptions {
  /**
   * A confirmacao de dados esta ligada NESTE time (migration 041).
   *
   * Desligada, a pergunta "esta correto?" continua existindo — ela e a unica
   * conferencia que sobra, e agora e de quem preenche —, mas nenhuma
   * consulta sai daqui: o nome nao e corrigido e zona e secao nao chegam
   * prontas, porque viraram campos obrigatorios do proprio formulario.
   */
  enabled: boolean;
  /** Corrige o campo "Nome completo" silenciosamente, sem avisar a pessoa. */
  onNameCorrection: (nome: string) => void;
  /**
   * Preenche zona e secao com o que a consulta eleitoral devolveu.
   *
   * `origem` distingue os dois motivos de chegar aqui vazio, que pedem
   * tratamentos opostos na tela:
   *
   *   'consulta' a consulta ACONTECEU. Veio vazio significa que a Justica
   *              Eleitoral nao respondeu aquele dado, e a pessoa precisa
   *              digitar;
   *   'reset'    a consulta anterior deixou de valer (a pessoa trocou o
   *              CPF). Nao ha nada a dizer: os campos so voltam a ser dela.
   */
  onZonaSecaoFilled: (
    zona: string | null,
    secao: string | null,
    origem: 'consulta' | 'reset',
  ) => void;
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
  enabled,
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

    // Time com a confirmacao desligada: a pessoa confirmou o numero e segue
    // preenchendo. Nenhuma consulta e feita, nem mesmo uma que voltaria
    // vazia — o servidor tambem recusa, mas gastar a viagem seria inutil.
    if (!enabled) {
      if (kind === 'cpf') confirmedCpfRef.current = value;
      else confirmedTituloRef.current = value;
      return;
    }

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
          onZonaSecaoFilled(null, null, 'reset');
        }

        const result = await lookupInviteCpf(value).catch(() => ({
          nome: null,
          token: null,
        }));
        cpfTokenRef.current = result.token;
        if (result.nome) onNameCorrection(result.nome);
      } else {
        confirmedTituloRef.current = value;

        const result = await lookupInviteTitulo(cpfTokenRef.current).catch(() => ({
          zona: null,
          secao: null,
          token: null,
        }));
        tseTokenRef.current = result.token;
        onZonaSecaoFilled(result.zona, result.secao, 'consulta');
      }
    } finally {
      setLoading(false);
    }
  }, [pending, enabled, onNameCorrection, onZonaSecaoFilled]);

  const getTokens = useCallback(
    () => ({ cpfToken: cpfTokenRef.current, tseToken: tseTokenRef.current }),
    [],
  );

  return { pending, loading, requestCpfConfirmation, requestTituloConfirmation, cancel, confirm, getTokens };
}
