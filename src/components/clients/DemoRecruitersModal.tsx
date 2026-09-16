'use client';

import { useEffect, useState } from 'react';
import type { Client } from '@/lib/types';
import { DEMO_RECRUITERS_MAX } from '@/lib/domain/demo-recruiters';
import { api } from '@/lib/repositories/http/api';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';

/**
 * Segunda camada do Time DEMO, ajustada a qualquer momento.
 *
 * Um time real tem duas camadas: o administrador cadastra gente, e parte
 * dessa gente cadastra mais gente. Sem a segunda, a demonstracao mostra mil
 * pessoas trazidas por uma pessoa so — e o "Ranking de cadastros equipe"
 * aparece com a lista inteira em zero, que e justamente o quadro que
 * responde "quem esta trazendo gente".
 *
 * O campo recebe o TOTAL desejado, e nao um passo. Um numero menor desfaz:
 * quem sai perde o vinculo e os cadastros dele voltam para o administrador.
 * Zero devolve o time a uma camada so. Por isso nao ha "adicionar" e
 * "remover" separados — ha o numero que o time deve ter.
 *
 * NINGUEM GANHA ENTRADA NO PAINEL. Os recrutadores existem para a
 * hierarquia: aparecem em "Cadastrado por", no ranking e na arvore da
 * equipe. O acesso deles nasce desligado, e o login por link + telefone so
 * aceita usuario ativo. As pessoas de um Time DEMO sao dados, e os telefones
 * delas sao ficticios: um telefone ficticio que abrisse o painel do time
 * seria uma porta aberta por engano.
 */

interface DemoRecruitersModalProps {
  open: boolean;
  onClose: () => void;
  client: Client;
  /** Recarrega a pagina do time depois da mudanca. */
  onChanged?: () => void;
}

export function DemoRecruitersModal({
  open,
  onClose,
  client,
  onChanged,
}: DemoRecruitersModalProps) {
  const toast = useToast();

  /**
   * O valor de hoje, vindo do servidor, e o que o ADMIN digitou por cima.
   *
   * Guardar o RESULTADO e derivar "carregando" dele — em vez de um
   * `setCarregando(true)` no corpo do efeito — evita a renderizacao em
   * cascata que o React desaconselha. O modal e montado so quando abre (ver
   * a pagina do time), entao o estado nasce limpo a cada abertura e o efeito
   * roda uma vez.
   */
  const [servidor, setServidor] = useState<{ recruiters: number; people: number } | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [editado, setEditado] = useState<string | null>(null);
  const [editadoPessoas, setEditadoPessoas] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregando = servidor === null && !falhou;
  // Sem o valor de hoje o campo abre vazio: melhor do que abrir com um
  // numero inventado, que o ADMIN salvaria sem perceber.
  const valor = editado ?? (servidor === null ? '' : String(servidor.recruiters));
  const valorPessoas = editadoPessoas ?? (servidor === null ? '' : String(servidor.people));

  useEffect(() => {
    let atual = true;

    api<{ recruiters: number; people: number }>(
      `/api/clients/demo/${client.id}/recrutadores`,
    )
      .then((resposta) => {
        if (atual) setServidor({ recruiters: resposta.recruiters, people: resposta.people });
      })
      .catch(() => {
        if (atual) setFalhou(true);
      });

    return () => {
      atual = false;
    };
  }, [client.id]);

  async function salvar() {
    if (salvando) return;
    setSalvando(true);
    try {
      const resposta = await api<{ recruiters: number; people: number }>(
        `/api/clients/demo/${client.id}/recrutadores`,
        {
          method: 'PATCH',
          body: { recruiters: Number(valor) || 0, people: Number(valorPessoas) || 0 },
        },
      );

      toast.success(
        resposta.recruiters === 0
          ? 'Segunda camada desfeita: o time voltou a ter só os cadastros do administrador.'
          : `${resposta.recruiters} pessoa(s) recrutando, com ${resposta.people} pessoa(s) novas no time.`,
      );
      onChanged?.();
      onClose();
    } catch (falha) {
      toast.error(
        falha instanceof Error && falha.message
          ? falha.message
          : 'Não foi possível ajustar a segunda camada.',
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pessoas que também recrutam"
      busy={salvando}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={salvar} loading={salvando} disabled={carregando}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-500">
          No time real, parte da equipe também cadastra gente. Aqui você diz quantas pessoas
          recrutam e quantas elas trazem — é o que enche o{' '}
          <strong className="font-semibold text-ink-700">Ranking de cadastros equipe</strong>. As
          pessoas trazidas são <strong className="font-semibold text-ink-700">novas</strong>: o
          time cresce, e elas entram no mapa como qualquer outra.
        </p>

        {carregando ? (
          <span className="flex h-11 items-center gap-2 text-sm text-ink-500">
            <Spinner className="size-4" /> Carregando os valores de hoje…
          </span>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="demo-recrutadores-total"
              label="Quantas pessoas recrutam"
              help={`De 0 a ${DEMO_RECRUITERS_MAX}.`}
            >
              <Input
                id="demo-recrutadores-total"
                value={valor}
                inputMode="numeric"
                placeholder="0"
                onChange={(event) => setEditado(event.target.value.replace(/\D/g, ''))}
              />
            </Field>

            <Field
              id="demo-recrutadores-pessoas"
              label="Quantas pessoas elas trazem"
              help="Pessoas novas no time. Zero desfaz a segunda camada."
            >
              <Input
                id="demo-recrutadores-pessoas"
                value={valorPessoas}
                inputMode="numeric"
                placeholder="0"
                onChange={(event) => setEditadoPessoas(event.target.value.replace(/\D/g, ''))}
              />
            </Field>
          </div>
        )}

        <p className="rounded-control border border-line bg-ink-50 p-3 text-[0.8125rem] text-ink-600">
          Salvar REFAZ a segunda camada: a anterior sai inteira e a nova entra. As pessoas do
          administrador não são tocadas. Quem recruta aparece na hierarquia e no ranking, mas{' '}
          <strong>não entra no painel</strong>: os telefones de um Time DEMO são fictícios, e o
          acesso delas nasce desligado.
        </p>
      </div>
    </Modal>
  );
}
