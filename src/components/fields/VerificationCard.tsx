'use client';

import { useState } from 'react';
import type { Client } from '@/lib/types';
import { api } from '@/lib/repositories/http/api';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';

interface VerificationCardProps {
  client: Client;
  /** Recarrega o time depois da troca: a prévia acompanha a nova regra. */
  onChanged?: () => void;
}

/**
 * Confirmacao dos dados pela FonteData, deste time (migration 041).
 *
 * LIGADA (padrao): quem preenche confirma o CPF e o titulo, o sistema
 * consulta o fornecedor, corrige o nome sozinho e preenche zona e secao com
 * o que a Justica Eleitoral respondeu. Cada consulta e cobrada.
 *
 * DESLIGADA: nenhuma consulta acontece para os cadastros deste time — nem no
 * formulario, nem depois do envio, nem pelo botao da ficha do integrante. A
 * pergunta "o CPF e o titulo estao corretos?" continua na tela, porque ela
 * passa a ser a UNICA conferencia que existe ali, e zona e secao viram
 * campos obrigatorios, digitados por quem preenche.
 *
 * O formulario montado pelo ADMIN nao e reescrito: a obrigatoriedade e
 * derivada do interruptor a cada abertura do link. Religar devolve o
 * formulario exatamente como ele esta aqui.
 */
export function VerificationCard({ client, onChanged }: VerificationCardProps) {
  const toast = useToast();
  const [ligado, setLigado] = useState(client.verificationEnabled);
  const [salvando, setSalvando] = useState(false);

  async function alternar(valor: boolean) {
    if (salvando) return;
    // Estado otimista: o botao responde no toque e volta atras se o servidor
    // recusar.
    setLigado(valor);
    setSalvando(true);

    try {
      await api(`/api/clients/${client.id}/verificacao`, {
        method: 'PATCH',
        body: { enabled: valor },
      });
      toast.success(
        valor
          ? 'Confirmação ligada. Os próximos cadastros deste time serão conferidos.'
          : 'Confirmação desligada. Nenhum cadastro deste time consultará a FonteData.',
      );
      onChanged?.();
    } catch (falha) {
      setLigado(!valor);
      toast.error(
        falha instanceof Error && falha.message
          ? falha.message
          : 'Não foi possível alterar a confirmação de dados.',
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirmação dos dados</CardTitle>
        <CardDescription>
          Vale só para este time e só para o Formulário 1, que é onde o CPF e o título são
          informados.
        </CardDescription>
      </CardHeader>

      <CardBody className="space-y-3">
        <Switch
          id="confirmacao-de-dados"
          checked={ligado}
          disabled={salvando}
          onChange={alternar}
          label="Conferir CPF e título de eleitor"
          description={
            ligado
              ? 'Cada cadastro consulta a FonteData. Consulta paga.'
              : 'Nenhuma consulta é feita nos cadastros deste time.'
          }
        />

        <p className="rounded-control bg-ink-50 p-3 text-[0.8125rem] leading-relaxed text-ink-700">
          {ligado ? (
            <>
              Quem preenche confirma o CPF e o título, o nome é corrigido pela consulta e{' '}
              <strong>zona e seção chegam prontas</strong>, do próprio título — sem ninguém digitar.
            </>
          ) : (
            <>
              O formulário continua perguntando se o CPF e o título digitados estão certos — essa
              passa a ser a única conferência. Como não há consulta,{' '}
              <strong>zona e seção viram campos obrigatórios</strong> e são digitadas por quem
              preenche.
            </>
          )}
        </p>
      </CardBody>
    </Card>
  );
}
