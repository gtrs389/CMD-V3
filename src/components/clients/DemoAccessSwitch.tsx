'use client';

import { useState } from 'react';
import type { Client } from '@/lib/types';
import { api } from '@/lib/repositories/http/api';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';

interface DemoAccessSwitchProps {
  client: Client;
  /** Recarrega a página do time depois da troca. */
  onChanged?: () => void;
}

/**
 * Chave de acesso do Time DEMO, para o ADMIN geral.
 *
 * Desligada, os administradores daquele time param de entrar, e quem estiver
 * dentro vê na hora que foi desconectado — o painel mantém um batimento com
 * o servidor justamente para isso.
 *
 * Nada é destruído: nenhum usuário é desativado, nenhuma sessão é revogada e
 * nenhuma senha muda. Religar devolve as pessoas exatamente onde estavam.
 *
 * O estado otimista existe porque esta chave costuma ser usada AO VIVO, na
 * frente de alguém: o botão precisa responder no toque, e volta atrás se o
 * servidor recusar.
 */
export function DemoAccessSwitch({ client, onChanged }: DemoAccessSwitchProps) {
  const toast = useToast();
  const [ligado, setLigado] = useState(client.demoAccessEnabled);
  const [salvando, setSalvando] = useState(false);

  async function alternar(valor: boolean) {
    if (salvando) return;
    setLigado(valor);
    setSalvando(true);
    try {
      await api(`/api/clients/demo/${client.id}/acesso`, {
        method: 'PATCH',
        body: { enabled: valor },
      });
      toast.success(
        valor
          ? 'Acesso religado. Quem estava dentro volta de onde parou.'
          : 'Acesso desligado. Quem estiver logado será desconectado.',
      );
      onChanged?.();
    } catch (falha) {
      setLigado(!valor);
      toast.error(
        falha instanceof Error && falha.message
          ? falha.message
          : 'Não foi possível alterar o acesso do Time DEMO.',
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="rounded-control border border-line bg-surface px-4 py-2.5 shadow-card">
      <Switch
        id="acesso-demo"
        checked={ligado}
        disabled={salvando}
        onChange={alternar}
        label="Acesso ao sistema"
        description={
          ligado ? 'Os administradores deste time podem entrar.' : 'Ninguém entra neste time.'
        }
      />
    </div>
  );
}
