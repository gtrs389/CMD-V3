'use client';

import { useMemo, useState } from 'react';
import { Eye, ListPlus, Plus, Settings2 } from 'lucide-react';
import type { Client, CustomField, Member } from '@/lib/types';
import { clientRepository } from '@/lib/repositories';
import {
  canAddField,
  countResponses,
  createField,
  canDuplicateField,
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
import { FormPreview } from './FormPreview';
import { FormSettingsCard } from './FormSettingsCard';

interface FormBuilderPanelProps {
  client: Client;
  members: Member[];
}

type View = 'campos' | 'previa' | 'ajustes';

/** Construtor do formulario do cliente: CRUD e reordenacao de campos. */
export function FormBuilderPanel({ client, members }: FormBuilderPanelProps) {
  const toast = useToast();
  const [view, setView] = useState<View>('campos');
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [removing, setRemoving] = useState<CustomField | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const fields = useMemo(
    () => [...client.form.fields].sort((a, b) => a.order - b.order),
    [client.form.fields],
  );

  async function persist(next: CustomField[], message: string) {
    try {
      await clientRepository.updateForm(client.id, { fields: reindex(next) });
      toast.success(message);
    } catch {
      toast.error('Não foi possível salvar o formulário.');
    }
  }

  function handleMove(from: number, to: number) {
    if (to < 0 || to >= fields.length) return;
    void persist(moveField(fields, from, to), 'Ordem atualizada.');
  }

  function handleDragEnd() {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      void persist(moveField(fields, dragIndex, overIndex), 'Ordem atualizada.');
    }
    setDragIndex(null);
    setOverIndex(null);
  }

  function openNewField() {
    if (!canAddField(fields)) {
      toast.error(`Limite de ${appConfig.limits.maxFieldsPerForm} campos atingido.`);
      return;
    }
    setEditing({ ...createField('text'), order: fields.length });
    setEditorOpen(true);
  }

  function handleSaveField(field: CustomField) {
    const exists = fields.some((item) => item.id === field.id);
    const next = exists
      ? fields.map((item) => (item.id === field.id ? field : item))
      : [...fields, field];

    setEditorOpen(false);
    setEditing(null);
    void persist(next, exists ? 'Campo atualizado.' : 'Campo adicionado.');
  }

  function handleDuplicate(field: CustomField) {
    if (!canDuplicateField(field)) return;
    if (!canAddField(fields)) {
      toast.error(`Limite de ${appConfig.limits.maxFieldsPerForm} campos atingido.`);
      return;
    }
    const index = fields.findIndex((item) => item.id === field.id);
    const next = [...fields];
    next.splice(index + 1, 0, duplicateField(field));
    void persist(next, 'Campo duplicado.');
  }

  async function handleDelete() {
    if (!removing) return;
    const next = fields.filter((item) => item.id !== removing.id);
    setRemoving(null);
    await persist(next, 'Campo excluido.');
  }

  const removingResponses = removing ? countResponses(members, removing.id) : 0;

  const views: Array<{ id: View; label: string; icon: React.ReactNode }> = [
    { id: 'campos', label: 'Campos', icon: <ListPlus className="size-4" /> },
    { id: 'previa', label: 'Pre-visualização', icon: <Eye className="size-4" /> },
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
          <Button onClick={openNewField}>
            <Plus aria-hidden="true" className="size-4" />
            Novo campo
          </Button>
        ) : null}
      </div>

      {view === 'campos' ? (
        <Card>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>Campos do formulário</CardTitle>
              <CardDescription>
                Arraste para reordenar no computador ou use as setas no celular.
              </CardDescription>
            </div>
          </CardHeader>
          <CardBody>
            {fields.length === 0 ? (
              <EmptyState
                compact
                icon={<ListPlus className="size-5" />}
                title="Nenhum campo configurado"
                description="Adicione os campos que a equipe deverá preencher."
                action={<Button onClick={openNewField}>Adicionar campo</Button>}
              />
            ) : (
              <ul className="space-y-2">
                {fields.map((field, index) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    index={index}
                    total={fields.length}
                    dragging={dragIndex === index}
                    dropTarget={overIndex === index}
                    responseCount={countResponses(members, field.id)}
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
      ) : null}

      {view === 'previa' ? <FormPreview client={client} /> : null}
      {view === 'ajustes' ? <FormSettingsCard client={client} /> : null}

      <FieldEditorModal
        open={editorOpen}
        field={editing}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        onSave={handleSaveField}
      />

      <ConfirmDialog
        open={removing !== null}
        title="Excluir campo"
        description={`O campo "${removing?.label ?? ''}" será removido do formulário público.`}
        confirmLabel="Excluir campo"
        onCancel={() => setRemoving(null)}
        onConfirm={handleDelete}
        details={
          removingResponses > 0 ? (
            <p className="rounded-control bg-warning-50 p-3 text-sm text-warning-600">
              <strong>{removingResponses}</strong>{' '}
              {removingResponses === 1 ? 'integrante já respondeu' : 'integrantes já responderam'}{' '}
              a este campo. As respostas deixarao de ser exibidas nas fichas.
            </p>
          ) : (
            <p className="rounded-control bg-ink-50 p-3 text-sm text-ink-700">
              Nenhum integrante respondeu a este campo até agora.
            </p>
          )
        }
      />
    </div>
  );
}
