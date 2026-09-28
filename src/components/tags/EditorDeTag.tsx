'use client';

import { useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import type { TagColor, TagInput } from '@/lib/types';
import { TAG_COLORS } from '@/lib/types';
import { NOME_DA_COR, SIMBOLOS_SUGERIDOS, normalizarTag } from '@/lib/domain/tags';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { ESTILO_DA_TAG, TagChip } from '@/components/members/TagChip';

const VAZIA: TagInput = { name: '', symbol: null, color: 'navy', description: null };

/**
 * Criar ou editar uma tag, vendo o resultado enquanto escreve.
 *
 * A previa e uma linha de ficha de verdade — nome, nivel e a tag ao lado —
 * porque e ali que a tag vai morar, e nao sozinha num canto.
 */
export function EditorDeTag({
  inicial,
  rotulo = 'Salvar tag',
  onSalvar,
  onCancelar,
}: {
  inicial?: TagInput;
  rotulo?: string;
  onSalvar: (tag: TagInput) => Promise<void>;
  onCancelar: () => void;
}) {
  const [tag, setTag] = useState<TagInput>(inicial ?? VAZIA);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const mudar = (parte: Partial<TagInput>) => {
    setTag((atual) => ({ ...atual, ...parte }));
    setErro(null);
  };

  async function salvar(event: FormEvent) {
    event.preventDefault();
    const pronta = normalizarTag(tag);
    if (!pronta.ok) {
      setErro(pronta.motivo);
      return;
    }
    setSalvando(true);
    try {
      await onSalvar(pronta.tag);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível salvar a tag.');
    } finally {
      setSalvando(false);
    }
  }

  const previa = { name: tag.name.trim() || 'Nome da tag', symbol: tag.symbol?.trim() || null, color: tag.color };

  return (
    <form onSubmit={salvar} className="space-y-4">
      {/* Previa: como a tag aparece na lista do time. */}
      <div className="rounded-card border border-line bg-ink-50/70 p-3">
        <p className="text-[0.6875rem] font-semibold tracking-wide text-ink-400 uppercase">Prévia</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm font-semibold text-ink-900">Maria Souza</span>
          <span className="inline-flex items-center rounded-pill bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700">
            Equipe
          </span>
          <TagChip tag={previa} className="animate-pop" key={`${previa.color}-${previa.symbol}`} />
        </div>
      </div>

      <Field id="tag-nome" label="Nome da tag" required error={erro ?? undefined}>
        <Input
          id="tag-nome"
          value={tag.name}
          maxLength={60}
          autoFocus
          placeholder="Ex.: Coordenador Delta Operacional"
          onChange={(event) => mudar({ name: event.target.value })}
          invalid={Boolean(erro)}
        />
      </Field>

      <div>
        <p className="text-sm font-medium text-ink-900">Símbolo</p>
        <p className="text-xs text-ink-500">Opcional. Até 3 caracteres, na frente do nome.</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => mudar({ symbol: null })}
            aria-pressed={!tag.symbol}
            className={cn(
              'min-h-9 rounded-control border px-3 text-xs font-medium transition-colors',
              !tag.symbol ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-line text-ink-500 hover:bg-ink-50',
            )}
          >
            Sem símbolo
          </button>
          {SIMBOLOS_SUGERIDOS.map((simbolo) => (
            <button
              key={simbolo}
              type="button"
              onClick={() => mudar({ symbol: simbolo })}
              aria-pressed={tag.symbol === simbolo}
              aria-label={`Símbolo ${simbolo}`}
              className={cn(
                'flex size-9 items-center justify-center rounded-control border text-sm font-bold transition-colors',
                tag.symbol === simbolo
                  ? 'border-brand-700 bg-brand-50 text-brand-800'
                  : 'border-line text-ink-700 hover:bg-ink-50',
              )}
            >
              {simbolo}
            </button>
          ))}
          <Input
            aria-label="Outro símbolo"
            value={tag.symbol && !(SIMBOLOS_SUGERIDOS as readonly string[]).includes(tag.symbol) ? tag.symbol : ''}
            onChange={(event) => mudar({ symbol: Array.from(event.target.value).slice(0, 3).join('') || null })}
            placeholder="Outro"
            className="h-9 min-h-9 w-20 text-center"
          />
        </div>
      </div>

      <div>
        <p id="tag-cor" className="text-sm font-medium text-ink-900">
          Cor
        </p>
        <div role="radiogroup" aria-labelledby="tag-cor" className="mt-2 flex flex-wrap gap-2">
          {TAG_COLORS.map((cor: TagColor) => {
            const ativa = tag.color === cor;
            return (
              <button
                key={cor}
                type="button"
                role="radio"
                aria-checked={ativa}
                aria-label={NOME_DA_COR[cor]}
                title={NOME_DA_COR[cor]}
                onClick={() => mudar({ color: cor })}
                className={cn(
                  'relative flex size-9 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-surface transition-transform hover:scale-105',
                  ESTILO_DA_TAG[cor].amostra,
                  ativa ? 'ring-ink-900' : 'ring-transparent',
                )}
              >
                {cor === 'navy' ? <span className="text-sm font-bold text-gold-400">Δ</span> : null}
                {ativa && cor !== 'navy' ? <Check aria-hidden="true" className="size-4 text-white" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <Field id="tag-descricao" label="Descrição" help="Opcional. Aparece para quem administra as tags.">
        <Textarea
          id="tag-descricao"
          rows={2}
          maxLength={240}
          value={tag.description ?? ''}
          onChange={(event) => mudar({ description: event.target.value || null })}
          placeholder="Para que serve esta tag"
        />
      </Field>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="submit" loading={salvando}>
          {rotulo}
        </Button>
      </div>
    </form>
  );
}
