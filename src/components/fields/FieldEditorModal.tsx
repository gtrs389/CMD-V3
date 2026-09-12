'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { FIELD_TYPES, type CustomField, type FieldOption, type FieldType } from '@/lib/types';
import {
  FIELD_TYPE_HINTS,
  FIELD_TYPE_LABELS,
  canDisableField,
  createOption,
  isLockedRequired,
  hasFixedOptions,
  isSystemField,
} from '@/lib/domain/form-config';
import { requiresOptions } from '@/lib/validation/field.schema';
import { appConfig } from '@/config/app.config';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  RELATIONSHIP_COLORS,
  RELATIONSHIP_COLOR_CLASSES,
  RELATIONSHIP_COLOR_LABELS,
  RELATIONSHIP_ICONS,
  RELATIONSHIP_ICON_LABELS,
  relationshipColor,
  relationshipIcon,
} from '@/lib/domain/relationship';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';

interface FieldEditorModalProps {
  open: boolean;
  /** Ausente ao criar um campo novo. */
  field: CustomField | null;
  onClose: () => void;
  onSave: (field: CustomField) => void;
  /**
   * Tipos oferecidos. O padrao sao todos. O questionario passa a lista sem
   * `photo`: ele nao recebe arquivo, e o banco recusaria de qualquer forma.
   */
  allowedTypes?: readonly FieldType[];
}

interface DraftErrors {
  label?: string;
  options?: string;
}

/**
 * Criacao e edicao de um campo do formulario.
 *
 * O conteudo e remontado a cada campo aberto (via `key`), por isso o rascunho
 * pode ser inicializado direto do estado, sem efeitos de sincronizacao.
 */
export function FieldEditorModal({
  open,
  field,
  onClose,
  onSave,
  allowedTypes = FIELD_TYPES,
}: FieldEditorModalProps) {
  if (!open || !field) return null;
  return (
    <FieldEditorForm
      key={field.id}
      field={field}
      onClose={onClose}
      onSave={onSave}
      allowedTypes={allowedTypes}
    />
  );
}

interface FieldEditorFormProps {
  field: CustomField;
  onClose: () => void;
  onSave: (field: CustomField) => void;
  allowedTypes: readonly FieldType[];
}

function FieldEditorForm({ field, onClose, onSave, allowedTypes }: FieldEditorFormProps) {
  const [draft, setDraft] = useState<CustomField>(field);
  const [errors, setErrors] = useState<DraftErrors>({});

  const system = isSystemField(draft);
  // Genero e Estado tem lista fixa do sistema: o ADMIN nao edita as opcoes.
  const fixedOptions = hasFixedOptions(draft);
  const needsOptions = requiresOptions(draft.type) && !fixedOptions;
  // O vinculo edita tambem icone, cor e ordem de cada opcao.
  const richOptions = draft.systemKey === 'relationship';

  /** Altera uma propriedade da opcao mantendo o identificador estavel. */
  function patchOption(id: string, changes: Partial<FieldOption>) {
    patch({
      options: draft.options.map((option) =>
        option.id === id ? { ...option, ...changes } : option,
      ),
    });
  }

  function moveOption(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draft.options.length) return;
    const next = [...draft.options];
    [next[index], next[target]] = [next[target], next[index]];
    patch({ options: next });
  }

  const typeOptions = useMemo(
    () => allowedTypes.map((type) => ({ value: type, label: FIELD_TYPE_LABELS[type] })),
    [allowedTypes],
  );

  function patch(changes: Partial<CustomField>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function changeType(type: FieldType) {
    setDraft((current) => ({
      ...current,
      type,
      options: requiresOptions(type)
        ? current.options.length > 0
          ? current.options
          : [createOption(''), createOption('')]
        : [],
    }));
  }

  function updateOption(id: string, label: string) {
    patch({
      options: draft.options.map((option) => (option.id === id ? { ...option, label } : option)),
    });
  }

  function addOption() {
    if (draft.options.length >= appConfig.limits.maxOptionsPerField) return;
    patch({ options: [...draft.options, createOption('')] });
  }

  function removeOption(id: string) {
    patch({ options: draft.options.filter((option: FieldOption) => option.id !== id) });
  }

  function handleSave() {
    const next: DraftErrors = {};
    const label = draft.label.trim();

    if (label.length < 2) next.label = 'Informe um título com pelo menos 2 caracteres.';

    const cleanedOptions = draft.options
      .map((option) => ({ ...option, label: option.label.trim() }))
      .filter((option) => option.label.length > 0);

    if (requiresOptions(draft.type)) {
      if (!fixedOptions && cleanedOptions.length < 2) {
        next.options = 'Cadastre pelo menos duas opções.';
      }
      const seen = new Set(cleanedOptions.map((option) => option.label.toLowerCase()));
      if (seen.size !== cleanedOptions.length) next.options = 'Há opções repetidas.';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    onSave({
      ...draft,
      label,
      placeholder: draft.placeholder.trim(),
      helpText: draft.helpText.trim(),
      options: requiresOptions(draft.type) ? cleanedOptions : [],
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={field.label ? 'Editar campo' : 'Novo campo'}
      description="O identificador interno do campo não muda ao renomear o título."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>Salvar campo</Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field
          id="campo-tipo"
          label="Tipo de campo"
          help={system ? 'Campos nativos mantem o tipo original.' : FIELD_TYPE_HINTS[draft.type]}
        >
          <Select
            id="campo-tipo"
            value={draft.type}
            disabled={system}
            onChange={(event) => changeType(event.target.value as FieldType)}
          >
            {typeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="campo-titulo" label="Título" required error={errors.label}>
          <Input
            id="campo-titulo"
            value={draft.label}
            invalid={Boolean(errors.label)}
            placeholder="Ex.: Bairro de atuação"
            onChange={(event) => patch({ label: event.target.value })}
          />
        </Field>

        {draft.type !== 'checkbox' && draft.type !== 'photo' ? (
          <Field
            id="campo-placeholder"
            label="Placeholder"
            help="Texto de exemplo exibido dentro do campo vazio."
          >
            <Input
              id="campo-placeholder"
              value={draft.placeholder}
              placeholder="Ex.: Digite o bairro"
              onChange={(event) => patch({ placeholder: event.target.value })}
            />
          </Field>
        ) : null}

        <Field
          id="campo-ajuda"
          label="Texto de ajuda"
          help="Orientação curta exibida abaixo do campo."
        >
          <Input
            id="campo-ajuda"
            value={draft.helpText}
            placeholder="Ex.: Informe apenas o bairro principal"
            onChange={(event) => patch({ helpText: event.target.value })}
          />
        </Field>

        {fixedOptions ? (
          <p className="rounded-control bg-ink-50 p-3 text-sm text-ink-700">
            As opções deste campo são definidas pelo sistema e não podem ser alteradas.
          </p>
        ) : null}

        {needsOptions ? (
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink-700">Opções</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={addOption}
                disabled={draft.options.length >= appConfig.limits.maxOptionsPerField}
              >
                <Plus aria-hidden="true" className="size-4" />
                Adicionar
              </Button>
            </div>

            <ul className="mt-2 space-y-2">
              {draft.options.map((option, index) => {
                const Icone = relationshipIcon(option);
                return (
                  <li
                    key={option.id}
                    className={
                      richOptions
                        ? 'rounded-control border border-line p-3'
                        : 'flex items-center gap-2'
                    }
                  >
                    <div className="flex items-center gap-2">
                      {richOptions ? (
                        <span
                          aria-hidden="true"
                          className={`flex size-9 shrink-0 items-center justify-center rounded-full ${RELATIONSHIP_COLOR_CLASSES[relationshipColor(option)]}`}
                        >
                          <Icone className="size-[1.125rem]" />
                        </span>
                      ) : null}

                      <Input
                        aria-label={`Nome da opção ${index + 1}`}
                        value={option.label}
                        placeholder={`Opção ${index + 1}`}
                        onChange={(event) => updateOption(option.id, event.target.value)}
                      />

                      {richOptions ? (
                        <>
                          <IconButton
                            label={`Mover opção ${index + 1} para cima`}
                            icon={<ArrowUp className="size-4" />}
                            disabled={index === 0}
                            onClick={() => moveOption(index, -1)}
                          />
                          <IconButton
                            label={`Mover opção ${index + 1} para baixo`}
                            icon={<ArrowDown className="size-4" />}
                            disabled={index === draft.options.length - 1}
                            onClick={() => moveOption(index, 1)}
                          />
                        </>
                      ) : null}

                      <IconButton
                        label={`Remover opção ${index + 1}`}
                        icon={<Trash2 className="size-4" />}
                        variant="danger"
                        disabled={draft.options.length <= 1}
                        onClick={() => removeOption(option.id)}
                      />
                    </div>

                    {richOptions ? (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <Select
                          aria-label={`Ícone da opção ${index + 1}`}
                          value={relationshipIcon(option) ? (option.icon ?? 'heart') : 'heart'}
                          onChange={(event) => patchOption(option.id, { icon: event.target.value })}
                        >
                          {RELATIONSHIP_ICONS.map((nome) => (
                            <option key={nome} value={nome}>
                              {RELATIONSHIP_ICON_LABELS[nome]}
                            </option>
                          ))}
                        </Select>

                        <Select
                          aria-label={`Cor da opção ${index + 1}`}
                          value={relationshipColor(option)}
                          onChange={(event) => patchOption(option.id, { color: event.target.value })}
                        >
                          {RELATIONSHIP_COLORS.map((cor) => (
                            <option key={cor} value={cor}>
                              {RELATIONSHIP_COLOR_LABELS[cor]}
                            </option>
                          ))}
                        </Select>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {errors.options ? (
              <p role="alert" className="mt-2 text-xs font-medium text-danger-600">
                {errors.options}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-4 rounded-control bg-ink-50 p-4">
          <Switch
            id="campo-obrigatorio"
            label="Preenchimento obrigatório"
            description={
              draft.systemKey === 'phone'
                ? 'O telefone cria o acesso ao CMD e permanece obrigatório.'
                : isLockedRequired(draft)
                  ? 'O nome identifica o integrante e permanece obrigatório.'
                  : 'A pessoa não consegue enviar sem preencher.'
            }
            checked={draft.required}
            disabled={isLockedRequired(draft)}
            onChange={(checked) => patch({ required: checked })}
          />

          <Switch
            id="campo-ativo"
            label="Campo ativo"
            description={
              canDisableField(draft)
                ? 'Campos desativados não aparecem no formulário público.'
                : 'Campo nativo essencial: permanece sempre ativo.'
            }
            checked={draft.enabled}
            disabled={!canDisableField(draft)}
            onChange={(checked) => patch({ enabled: checked })}
          />
        </div>
      </div>
    </Modal>
  );
}
