'use client';

import { useState } from 'react';
import { ClipboardList, ListPlus, Plus } from 'lucide-react';
import type { CustomField, FieldType, SurveyConfig } from '@/lib/types';
import { FIELD_TYPES } from '@/lib/types';
import { updateSurvey } from '@/lib/repositories';
import { appConfig } from '@/config/app.config';
import { canAddField, createField, duplicateField, moveField, reindex } from '@/lib/domain/form-config';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { FieldEditorModal } from '@/components/fields/FieldEditorModal';
import { FieldRow } from '@/components/fields/FieldRow';

/**
 * Construtor do questionario do time.
 *
 * EXCLUSIVO DO ADMIN GERAL. A rota confere `survey.manage`, que nenhum outro
 * perfil tem: esconder o painel nao protegeria nada sozinho.
 *
 * As perguntas sao livres — nao existe campo de sistema aqui. O questionario
 * nao pede CPF, titulo de eleitor nem endereco, e nao aciona verificacao
 * nenhuma: quem responde nao vira integrante.
 *
 * Envio de imagem fica de fora da lista de tipos pelo mesmo motivo: o
 * questionario nao recebe arquivo, e o banco recusaria de qualquer forma.
 */

/** Tudo menos `photo`: o questionario nao recebe arquivo. */
const SURVEY_FIELD_TYPES: readonly FieldType[] = FIELD_TYPES.filter((type) => type !== 'photo');

interface SurveyBuilderPanelProps {
  clientId: string;
  survey: SurveyConfig;
  /** Chamado depois de cada gravacao, com a configuracao ja atualizada. */
  onChange: (survey: SurveyConfig) => void;
}

export function SurveyBuilderPanel({ clientId, survey, onChange }: SurveyBuilderPanelProps) {
  const toast = useToast();
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [removing, setRemoving] = useState<CustomField | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Rascunho dos textos: gravado no botao, e nao a cada tecla.
  const [title, setTitle] = useState(survey.title);
  const [intro, setIntro] = useState(survey.introText);
  const [success, setSuccess] = useState(survey.successMessage);

  const fields = [...survey.fields].sort((a, b) => a.order - b.order);
  const textosMudaram =
    title !== survey.title || intro !== survey.introText || success !== survey.successMessage;

  async function persist(changes: Parameters<typeof updateSurvey>[1], message: string) {
    setSaving(true);
    try {
      onChange(await updateSurvey(clientId, changes));
      toast.success(message);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível salvar o questionário.',
      );
    } finally {
      setSaving(false);
    }
  }

  function persistFields(next: CustomField[], message: string) {
    void persist({ fields: reindex(next) }, message);
  }

  function openNewField() {
    if (!canAddField(fields)) {
      toast.error(`Limite de ${appConfig.limits.maxFieldsPerForm} perguntas atingido.`);
      return;
    }
    setEditing({ ...createField('text'), order: fields.length });
    setEditorOpen(true);
  }

  function handleSaveField(field: CustomField) {
    const existe = fields.some((item) => item.id === field.id);
    const next = existe
      ? fields.map((item) => (item.id === field.id ? field : item))
      : [...fields, field];

    setEditorOpen(false);
    setEditing(null);
    persistFields(next, existe ? 'Pergunta atualizada.' : 'Pergunta adicionada.');
  }

  function handleMove(from: number, to: number) {
    if (to < 0 || to >= fields.length) return;
    persistFields(moveField(fields, from, to), 'Ordem atualizada.');
  }

  function handleDragEnd() {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      persistFields(moveField(fields, dragIndex, overIndex), 'Ordem atualizada.');
    }
    setDragIndex(null);
    setOverIndex(null);
  }

  function handleDuplicate(field: CustomField) {
    if (!canAddField(fields)) {
      toast.error(`Limite de ${appConfig.limits.maxFieldsPerForm} perguntas atingido.`);
      return;
    }
    const index = fields.findIndex((item) => item.id === field.id);
    const next = [...fields];
    next.splice(index + 1, 0, duplicateField(field));
    persistFields(next, 'Pergunta duplicada.');
  }

  function handleDelete() {
    if (!removing) return;
    const next = fields.filter((item) => item.id !== removing.id);
    setRemoving(null);
    persistFields(next, 'Pergunta excluída.');
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Questionário do time</CardTitle>
            <CardDescription>
              Uma pesquisa que a equipe envia para outras pessoas. Quem responde não entra na
              equipe e não recebe acesso ao sistema.
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <Switch
            checked={survey.active}
            disabled={saving}
            onChange={(checked) =>
              void persist(
                { active: checked },
                checked ? 'Questionário ligado.' : 'Questionário desligado.',
              )
            }
            label="Questionário ativo"
            description="Desligado, nenhum link deste time aceita resposta — nem os já enviados."
          />

          <Field id="questionario-titulo" label="Título" help="Aparece no topo da tela de quem responde.">
            <Input
              id="questionario-titulo"
              value={title}
              maxLength={120}
              disabled={saving}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>

          <Field
            id="questionario-intro"
            label="Texto de abertura"
            help="Opcional. Explique em uma ou duas frases o que você quer saber."
          >
            <Textarea
              id="questionario-intro"
              rows={3}
              value={intro}
              maxLength={2000}
              disabled={saving}
              onChange={(event) => setIntro(event.target.value)}
            />
          </Field>

          <Field
            id="questionario-sucesso"
            label="Mensagem de agradecimento"
            help="Exibida depois que a pessoa envia a resposta."
          >
            <Input
              id="questionario-sucesso"
              value={success}
              maxLength={400}
              disabled={saving}
              onChange={(event) => setSuccess(event.target.value)}
            />
          </Field>

          <div className="flex justify-end">
            <Button
              disabled={!textosMudaram}
              loading={saving}
              onClick={() =>
                void persist(
                  { title, introText: intro, successMessage: success },
                  'Questionário salvo.',
                )
              }
            >
              Salvar textos
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Perguntas</CardTitle>
            <CardDescription>
              Nome e telefone já são pedidos automaticamente. Adicione aqui o que mais você quer
              perguntar.
            </CardDescription>
          </div>
          <Button onClick={openNewField} disabled={saving}>
            <Plus aria-hidden="true" className="size-4" />
            Nova pergunta
          </Button>
        </CardHeader>
        <CardBody>
          {fields.length === 0 ? (
            <EmptyState
              compact
              icon={<ListPlus className="size-5" />}
              title="Nenhuma pergunta ainda"
              description="Sem pelo menos uma pergunta ativa, o link do questionário não pode ser gerado."
              action={<Button onClick={openNewField}>Adicionar pergunta</Button>}
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
                  // A contagem de respostas e do formulario de cadastro. Aqui
                  // excluir uma pergunta nunca apaga resposta: cada resposta
                  // guarda a propria copia do rotulo.
                  responseCount={0}
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

      <FieldEditorModal
        open={editorOpen}
        field={editing}
        allowedTypes={SURVEY_FIELD_TYPES}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        onSave={handleSaveField}
      />

      <ConfirmDialog
        open={removing !== null}
        title="Excluir pergunta"
        description={`A pergunta "${removing?.label ?? ''}" sai do questionário. As respostas já recebidas continuam guardadas.`}
        confirmLabel="Excluir pergunta"
        onCancel={() => setRemoving(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

/** Cabecalho curto usado por quem so envia o questionario, sem edita-lo. */
export function SurveySummaryCard({ survey }: { survey: SurveyConfig }) {
  const perguntas = survey.fields.filter((field) => field.enabled).length;

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{survey.title}</CardTitle>
          <CardDescription>
            {survey.active
              ? `${perguntas} ${perguntas === 1 ? 'pergunta' : 'perguntas'}. Gere um link e envie para quem você quer ouvir.`
              : 'O questionário está desligado. Fale com a administração para ativá-lo.'}
          </CardDescription>
        </div>
      </CardHeader>
      {survey.introText ? (
        <CardBody>
          <p className="flex gap-2 text-sm whitespace-pre-line text-ink-600">
            <ClipboardList aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-400" />
            {survey.introText}
          </p>
        </CardBody>
      ) : null}
    </Card>
  );
}
