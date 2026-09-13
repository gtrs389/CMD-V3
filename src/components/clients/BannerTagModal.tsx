'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { BannerTag, Client } from '@/lib/types';
import { DEFAULT_BANNER_TAG } from '@/lib/types';
import { clientRepository } from '@/lib/repositories';
import { InviteBanner } from '@/components/public/InviteBanner';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

interface BannerTagModalProps {
  open: boolean;
  client: Client;
  onClose: () => void;
}

/** Limites iguais aos `check` da migration 022. */
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Uma casa decimal basta para posicao e largura. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** O corpo da fonte pede mais precisao: duas casas. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Ajuste da estampa "#NOME DO TIME" sobre o banner do celular.
 *
 * A previa e o BANNER DE VERDADE, com a mesma camada de texto que a pessoa
 * convidada vai ver. Arrastar a estampa move a posicao; os campos ao lado
 * cuidam da largura da faixa, do corpo da fonte e da cor.
 *
 * Tudo e guardado em PORCENTAGEM da propria imagem, nunca em pixels da tela:
 * por isso a estampa cai no mesmo ponto do banner tanto aqui, na previa
 * larga, quanto no celular estreito de quem abre o link.
 *
 * Exclusivo do ADMIN geral: a rota de atualizacao do time exige
 * `client.update`, que so esse perfil tem.
 */
export function BannerTagModal({ open, client, onClose }: BannerTagModalProps) {
  const toast = useToast();
  const areaRef = useRef<HTMLDivElement>(null);
  const [tag, setTag] = useState<BannerTag>(client.bannerTag);
  const [saving, setSaving] = useState(false);

  function patch(parte: Partial<BannerTag>) {
    setTag((atual) => ({ ...atual, ...parte }));
  }

  /**
   * Arrastar sobre a previa.
   *
   * A posicao vira porcentagem da area da imagem na hora, entao o que a
   * pessoa ve aqui e exatamente o que sera gravado. O ponteiro e capturado
   * para o arrasto continuar mesmo saindo da imagem.
   */
  function handlePointer(event: ReactPointerEvent<HTMLDivElement>) {
    const area = areaRef.current;
    if (!area) return;

    const caixa = area.getBoundingClientRect();
    if (caixa.width === 0 || caixa.height === 0) return;

    const x = ((event.clientX - caixa.left) / caixa.width) * 100;
    const y = ((event.clientY - caixa.top) / caixa.height) * 100;

    patch({
      // O ponteiro marca o CENTRO da estampa; a faixa comeca meia largura
      // antes dele.
      left: round(clamp(x - tag.width / 2, 0, 100)),
      top: round(clamp(y, 0, 100)),
    });
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    handlePointer(event);
  }

  function drag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) handlePointer(event);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await clientRepository.update(client.id, { bannerTag: tag });
      toast.success('Estampa do banner salva.');
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível salvar a estampa.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      size="lg"
      title="Estampa do banner"
      description="Arraste o texto sobre a camisa e ajuste tamanho e cor. É assim que a pessoa convidada verá no celular."
      footer={
        <>
          <Button variant="ghost" onClick={() => setTag({ ...DEFAULT_BANNER_TAG })}>
            Restaurar padrão
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving}>
            Salvar estampa
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Previa: o banner real, com a camada real. A area de arrasto cobre
            exatamente a imagem, entao a porcentagem calculada e a da
            imagem — nunca a da tela. */}
        <div
          ref={areaRef}
          onPointerDown={startDrag}
          onPointerMove={drag}
          className="relative cursor-crosshair touch-none overflow-hidden rounded-control border border-line select-none"
        >
          {/* O codigo e um exemplo: cada link gera o seu. Ele entra na
              previa para o ajuste levar em conta as DUAS linhas da estampa,
              e nao so o nome. */}
          <InviteBanner teamName={client.name} tag={tag} code="H03" />
        </div>

        <p className="text-xs text-ink-500">
          Toque ou clique sobre a imagem para posicionar. O ponto marcado vira o centro da estampa.
          O código abaixo do nome é um exemplo: cada link gera o seu.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="estampa-largura" label="Largura da faixa (%)" help="O texto fica centralizado nela.">
            <Input
              id="estampa-largura"
              type="number"
              min={1}
              max={100}
              step={0.5}
              value={tag.width}
              onChange={(event) =>
                patch({ width: round(clamp(Number(event.target.value), 1, 100)) })
              }
            />
          </Field>

          <Field id="estampa-tamanho" label="Tamanho da fonte (%)" help="Proporcional à largura do banner.">
            <Input
              id="estampa-tamanho"
              type="number"
              min={0.3}
              max={20}
              step={0.1}
              value={tag.size}
              onChange={(event) =>
                patch({ size: round2(clamp(Number(event.target.value), 0.3, 20)) })
              }
            />
          </Field>

          <Field id="estampa-esquerda" label="Distância da esquerda (%)">
            <Input
              id="estampa-esquerda"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={tag.left}
              onChange={(event) =>
                patch({ left: round(clamp(Number(event.target.value), 0, 100)) })
              }
            />
          </Field>

          <Field id="estampa-topo" label="Distância do topo (%)">
            <Input
              id="estampa-topo"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={tag.top}
              onChange={(event) => patch({ top: round(clamp(Number(event.target.value), 0, 100)) })}
            />
          </Field>

          <Field id="estampa-cor" label="Cor do texto" help="Hexadecimal de 6 dígitos.">
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Escolher a cor da estampa"
                value={tag.color}
                onChange={(event) => patch({ color: event.target.value })}
                className="size-11 shrink-0 cursor-pointer rounded-control border border-line-strong bg-surface p-1"
              />
              <Input
                id="estampa-cor"
                value={tag.color}
                spellCheck={false}
                onChange={(event) => {
                  const valor = event.target.value.trim();
                  patch({ color: valor.startsWith('#') ? valor : `#${valor}` });
                }}
                className="font-mono"
              />
            </div>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
