'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { loadSampleData } from '@/lib/mock/seed';
import { NetworkError } from '@/lib/repositories';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

/**
 * Carrega dados de exemplo para demonstrar a operacao.
 * Escreve pelos mesmos repositorios do restante do sistema.
 */
export function SampleDataButton() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const total = await loadSampleData();
      toast.success(`Dados de exemplo carregados: 2 times e ${total} integrantes.`);
    } catch (error) {
      toast.error(
        error instanceof NetworkError
          ? error.message
          : 'Não foi possível carregar os dados de exemplo.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" loading={loading} onClick={handleClick}>
      {!loading ? <Sparkles aria-hidden="true" className="size-4" /> : null}
      Carregar dados de exemplo
    </Button>
  );
}
