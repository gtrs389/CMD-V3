'use client';

import { useState } from 'react';
import { api } from '@/lib/repositories/http/api';
import { VERIFICACOES } from '@/lib/domain/verificacoes-de-inconsistencia';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';

const GRUPOS = [...new Set(VERIFICACOES.map((v) => v.grupo))];

/**
 * Liga e desliga cada verificacao do quadro de Inconsistencias deste time.
 *
 * Desligada, a verificacao some do quadro, dos filtros por dado, das
 * contagens, da nota e do PDF. Nenhuma ficha muda: religar traz de volta.
 * Salva de uma vez, no "Salvar" — trocar varias chaves nao dispara varias
 * gravacoes.
 */
export function VerificacoesModal({
  open,
  onClose,
  clientId,
  desligadas,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  desligadas: readonly string[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [rascunho, setRascunho] = useState<string[]>([...desligadas]);
  const [salvando, setSalvando] = useState(false);
  const [aberto, setAberto] = useState(open);

  // Cada abertura comeca do que esta salvo.
  if (open !== aberto) {
    setAberto(open);
    if (open) setRascunho([...desligadas]);
  }

  const ligada = (id: string) => !rascunho.includes(id);
  function alternar(id: string, valor: boolean) {
    setRascunho((atual) => (valor ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  async function salvar() {
    setSalvando(true);
    try {
      await api(`/api/clients/${clientId}/inconsistencias`, {
        method: 'PATCH',
        body: { desligadas: rascunho },
      });
      toast.success(
        rascunho.length === 0
          ? 'Todas as verificações estão ligadas.'
          : `${rascunho.length} ${rascunho.length === 1 ? 'verificação desligada' : 'verificações desligadas'} neste time.`,
      );
      onSaved();
      onClose();
    } catch (falha) {
      toast.error(falha instanceof Error && falha.message ? falha.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={salvando}
      title="O que aparece em Inconsistências"
      description="Vale só para este time. Desligar esconde a verificação do quadro, dos filtros, das contagens e do PDF — nenhuma ficha é alterada."
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={salvando || rascunho.length === 0}
            onClick={() => setRascunho([])}
          >
            Ligar todas
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={salvar} loading={salvando}>
              Salvar
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 px-4 py-4 sm:px-5">
        {GRUPOS.map((grupo) => (
          <section key={grupo}>
            <h3 className="mb-2 text-xs font-semibold tracking-[0.08em] text-ink-500 uppercase">{grupo}</h3>
            <div className="divide-y divide-line rounded-control border border-line">
              {VERIFICACOES.filter((v) => v.grupo === grupo).map((verificacao) => (
                <div key={verificacao.id} className="px-3 py-2.5">
                  <Switch
                    id={`verificacao-${verificacao.id}`}
                    checked={ligada(verificacao.id)}
                    disabled={salvando}
                    onChange={(valor) => alternar(verificacao.id, valor)}
                    label={verificacao.rotulo}
                    description={verificacao.descricao}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
