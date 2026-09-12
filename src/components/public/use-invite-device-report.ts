'use client';

import { useEffect, useRef } from 'react';
import { sendInviteDeviceSignals } from '@/lib/repositories';

/**
 * Manda, uma unica vez, os dados do navegador daquele clique.
 *
 * Usado nas tres telas publicas do convite: o formulario, o link expirado e
 * o link indisponivel. O clique em si, com o horario do banco e os sinais do
 * servidor, ja foi registrado na abertura do endereco — isto aqui apenas
 * completa o que so o navegador conhece.
 *
 * A tela nunca sabe o resultado e nunca mostra nada a respeito: a chamada
 * nao lanca, nao avisa e nao atrasa o preenchimento. Se o JavaScript falhar,
 * o registro do clique continua existindo.
 */
export function useInviteDeviceReport(): void {
  const enviado = useRef(false);

  useEffect(() => {
    if (enviado.current) return;
    enviado.current = true;
    void sendInviteDeviceSignals();
  }, []);
}
