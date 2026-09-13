'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Eye, ListPlus, Plus, Settings2 } from 'lucide-react';
import type { CustomField, FieldType } from '@/lib/types';
import { FIELD_TYPES } from '@/lib/types';
import {
  canAddField,
  canDuplicateField,
  createField,
  duplicateField,
  moveField,
  reindex,
} from '@/lib/domain/form-config';
import { appConfig } from '@/config/app.config';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { FieldEditorModal } from './FieldEditorModal';
import { FieldRow } from './FieldRow';

/**
 * Construtor de campos: UMA implementacao, usada por dois formularios.
 *
 * O formulario de cadastro e o questionario do time editam os campos
 * exatamente da mesma maneira — mesmas abas (Campos, Prévia, Ajustes), mesma
 * lista, mesmo arrastar e soltar, mesmas setas no celular, mesmo editor de
 * campo, mesma confirmacao de exclusao. Nada aqui e copia: corrigir um
 * comportamento neste arquivo corrige nos dois.
 *
 * O que cada formulario tem de proprio entra por propriedade: de onde vem a
 * lista, como ela e gravada, quais tipos de campo sao oferecidos, e o que
 * aparece nas abas de prévia e de ajustes.
 */

export interface FieldsBuilderTexts {
  /** "campo" ou "pergunta". Usado nas mensagens e nos botoes. */
  noun: string;
  nounPlural: string;
  cardTitle: string;
  cardDescription: string;
  emptyTitle: string;
  emptyDescription: string;
  /** Frase da confirmacao de exclusao, ja com o nome do campo. */
  removeDescription: (label: string) => string;
}

interface FieldsBuilderProps {
  fields: CustomField[];
  /** Grava a lista inteira, ja reordenada. */
  onPersist: (next: CustomField[], message: string) => void;
  /** Tipos oferecidos no editor. O padrao sao todos. */
  allowedTypes?: readonly FieldType[];
  /** Quantas respostas ja existem para um campo. Usado no aviso de exclusao. */
  countResponses?: (fieldId: string) => number;
  /** Detalhes extras da confirmacao de exclusao. */
  removeDetails?: (field: CustomField) => ReactNode;
  /** Conteudo da aba "Prévia". */
  preview: ReactNode;
  /** Conteudo da aba "Ajustes". */
  settings: ReactNode;
  /** Bloqueia as acoes enquanto uma gravacao esta em andamento. */
  busy?: boolean;
  /** Bloco fixo desenhado acima da lista (ex.: campos que nao se excluem). */
  lockedNotice?: ReactNode;
  texts: FieldsBuilderTexts;
}

type View = 'campos' | 'previa' | 'ajustes';

export function FieldsBuilder({
  fields,
  onPersist,
  allowedTypes = FIELD_TYPES,
  countResponses,
  removeDetails,
  preview,
  settings,
  busy = false,
  lockedNotice,
  texts,
}: FieldsBuilderProps) {
  const toast = useToast();
  const [view, setView] = useState<View>('campos');
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [removing, setRemoving] = useState<CustomField | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const ordenados = useMemo(
    () => [...fields].sort((a, b) => a.order - b.order),
    [fields],
  );

  function persist(next: CustomField[], message: string) {
    onPersist(reindex(next), message);
  }

  function handleMove(from: number, to: number) {
    if (to < 0 || to >= ordenados.length) return;
    persist(moveField(ordenados, from, to), 'Ordem atualizada.');
  }

  function handleDragEnd() {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      persist(moveField(ordenados, dragIndex, overIndex), 'Ordem atualizada.');
    }
    setDragIndex(null);
    setOverIndex(null);
  }

  function openNewField() {
    if (!canAddField(ordenados)) {
      toast.error(`Limite de ${appConfig.limits.maxFieldsPerForm} ${texts.nounPlural} atingido.`);
      return;
    }
    // O primeiro tipo oferecido e o padrao: em um construtor sem `text` o
    // campo novo nao pode nascer com um tipo que o editor nem lista.
    setEditing({
      ...createField(allowedTypes.includes('text') ? 'text' : allowedTypes[0]),
      order: ordenados.length,
    });
    setEditorOpen(true);
  }

  function handleSaveField(field: CustomField) {
    const existe = ordenados.some((item) => item.id === field.id);
    const next = existe
      ? ordenados.map((item) => (item.id === field.id ? field : item))
      : [...ordenados, field];

    setEditorOpen(false);
    setEditing(null);
    persist(next, existe ? `${capitalize(texts.noun)} atualizado.` : `${capitalize(texts.noun)} adicionado.`);
  }

  function handleDuplicate(field: CustomField) {
    if (!canDuplicateField(field)) return;
    if (!canAddField(ordenados)) {
      toast.error(`Limite de ${appConfig.limits.maxFieldsPerForm} ${texts.nounPlural} atingido.`);
      return;
    }
    const index = ordenados.findIndex((item) => item.id === field.id);
    const next = [...ordenados];
    next.splice(index + 1, 0, duplicateField(field));
    persist(next, `${capitalize(texts.noun)} duplicado.`);
  }

  function handleDelete() {
    if (!removing) return;
    const next = ordenados.filter((item) => item.id !== removing.id);
    setRemoving(null);
    persist(next, `${capitalize(texts.noun)} excluído.`);
  }

  const views: Array<{ id: View; label: string; icon: ReactNode }> = [
    { id: 'campos', label: capitalize(texts.nounPlural), icon: <ListPlus className="size-4" /> },
    { id: 'previa', label: 'Pré-visualização', icon: <Eye className="size-4" /> },
    { id: 'ajustes', label: 'Ajustes', icon: <Settings2 className="size-4" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="scrollbar-slim -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {views.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              aria-pressed={view === item.id}
              className={
                view === item.id
                  ? 'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-sm font-medium text-ink-900 shadow-card'
                  : 'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control px-3 text-sm font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900'
              }
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        {view === 'campos' ? (
          <Button onClick={openNewField} disabled={busy}>
            <Plus aria-hidden="true" className="size-4" />
            {`Novo ${texts.noun}`}
          </Button>
        ) : null}
      </div>

      {view === 'campos' ? (
        <>
          {lockedNotice}

          <Card>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>{texts.cardTitle}</CardTitle>
                <CardDescription>{texts.cardDescription}</CardDescription>
              </div>
            </CardHeader>
            <CardBody>
              {ordenados.length === 0 ? (
                <EmptyState
                  compact
                  icon={<ListPlus className="size-5" />}
                  title={texts.emptyTitle}
                  description={texts.emptyDescription}
                  action={<Button onClick={openNewField}>{`Adicionar ${texts.noun}`}</Button>}
                />
              ) : (
                <ul className="space-y-2">
                  {ordenados.map((field, index) => (
                    <FieldRow
                      key={field.id}
                      field={field}
                      index={index}
                      total={ordenados.length}
                      dragging={dragIndex === index}
                      dropTarget={overIndex === index}
                      responseCount={countResponses?.(field.id) ?? 0}
                      onMove={handleMove}
                      onEdit={(item) => {
                        setEditing(item);
                        setEditorOpen(true);
                      }}
                      onDuplicate={handleDuplicate}
                      onDelete={setRemoving}
                      onDragStart={setDragIndex}
                      onDragEnter={setOverIndex}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </>
      ) : null}

      {view === 'previa' ? preview : null}
      {view === 'ajustes' ? settings : null}

      <FieldEditorModal
        open={editorOpen}
        field={editing}
        allowedTypes={allowedTypes}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        onSave={handleSaveField}
      />

      <ConfirmDialog
        open={removing !== null}
        title={`Excluir ${texts.noun}`}
        description={texts.removeDescription(removing?.label ?? '')}
        confirmLabel={`Excluir ${texts.noun}`}
        onCancel={() => setRemoving(null)}
        onConfirm={handleDelete}
        details={removing && removeDetails ? removeDetails(removing) : undefined}
      />
    </div>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
