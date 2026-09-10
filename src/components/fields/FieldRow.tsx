'use client';

import { ArrowDown, ArrowUp, Copy, GripVertical, Lock, Pencil, Trash2 } from 'lucide-react';
import type { CustomField } from '@/lib/types';
import { FIELD_TYPE_LABELS, canDeleteField, isSystemField } from '@/lib/domain/form-config';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/IconButton';
import { Menu } from '@/components/ui/Menu';

interface FieldRowProps {
  field: CustomField;
  index: number;
  total: number;
  dragging: boolean;
  dropTarget: boolean;
  responseCount: number;
  onMove: (from: number, to: number) => void;
  onEdit: (field: CustomField) => void;
  onDuplicate: (field: CustomField) => void;
  onDelete: (field: CustomField) => void;
  onDragStart: (index: number) => void;
  onDragEnter: (index: number) => void;
  onDragEnd: () => void;
}

/**
 * Item da lista de campos.
 *
 * A reordenacao funciona por arrastar e soltar no desktop e por botoes de
 * subir/descer no celular e no teclado.
 */
export function FieldRow({
  field,
  index,
  total,
  dragging,
  dropTarget,
  responseCount,
  onMove,
  onEdit,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: FieldRowProps) {
  const system = isSystemField(field);

  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        onDragStart(index);
      }}
      onDragEnter={() => onDragEnter(index)}
      onDragOver={(event) => event.preventDefault()}
      onDragEnd={onDragEnd}
      onDrop={(event) => {
        event.preventDefault();
        onDragEnd();
      }}
      className={cn(
        'flex items-start gap-2 rounded-control border bg-surface p-3 transition-colors',
        dragging ? 'border-brand-500 opacity-60' : 'border-line',
        dropTarget && !dragging && 'border-brand-500 bg-brand-50',
        !field.enabled && 'opacity-70',
      )}
    >
      <span
        aria-hidden="true"
        className="hidden cursor-grab pt-2 text-ink-400 active:cursor-grabbing sm:block"
        title="Arraste para reordenar"
      >
        <GripVertical className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 truncate text-sm font-semibold text-ink-900">
            {field.label || 'Campo sem título'}
          </p>
          {system ? (
            <Badge tone="neutral">
              <Lock aria-hidden="true" className="size-3" />
              Nativo
            </Badge>
          ) : null}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge tone="brand">{FIELD_TYPE_LABELS[field.type]}</Badge>
          <Badge tone={field.required ? 'warning' : 'neutral'}>
            {field.required ? 'Obrigatório' : 'Opcional'}
          </Badge>
          {!field.enabled ? <Badge tone="neutral">Desativado</Badge> : null}
          {responseCount > 0 ? (
            <Badge tone="info">
              {responseCount} {responseCount === 1 ? 'resposta' : 'respostas'}
            </Badge>
          ) : null}
        </div>

        {field.helpText ? (
          <p className="mt-1.5 truncate text-xs text-ink-500">{field.helpText}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton
          label={`Mover "${field.label}" para cima`}
          icon={<ArrowUp className="size-4" />}
          disabled={index === 0}
          onClick={() => onMove(index, index - 1)}
        />
        <IconButton
          label={`Mover "${field.label}" para baixo`}
          icon={<ArrowDown className="size-4" />}
          disabled={index === total - 1}
          onClick={() => onMove(index, index + 1)}
        />
        <Menu
          label={`Ações do campo ${field.label}`}
          actions={[
            {
              id: 'editar',
              label: 'Editar campo',
              icon: <Pencil className="size-4" />,
              onSelect: () => onEdit(field),
            },
            {
              id: 'duplicar',
              label: 'Duplicar campo',
              icon: <Copy className="size-4" />,
              onSelect: () => onDuplicate(field),
            },
            {
              id: 'excluir',
              label: 'Excluir campo',
              icon: <Trash2 className="size-4" />,
              tone: 'danger',
              disabled: !canDeleteField(field),
              onSelect: () => onDelete(field),
            },
          ]}
        />
      </div>
    </li>
  );
}
