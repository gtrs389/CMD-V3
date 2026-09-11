'use client';

import type { CustomField } from '@/lib/types';
import type { DynamicValue } from '@/lib/validation/dynamic-form';
import { maskPhone } from '@/lib/utils/phone';
import { GENDER_OPTIONS, UF_OPTIONS, maskCpf, maskVoterId } from '@/lib/utils/documents';
import { cn } from '@/lib/utils/cn';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field, describedBy } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { LocationField } from './LocationField';
import { useLocationChain } from './location-context';
import { RelationshipPicker } from './RelationshipPicker';

interface DynamicFieldInputProps {
  field: CustomField;
  value: DynamicValue;
  onChange: (value: DynamicValue) => void;
  error?: string;
  disabled?: boolean;
  /** Diferencia os IDs quando o mesmo campo aparece em mais de um lugar. */
  idPrefix?: string;
  allowCamera?: boolean;
  onImageError?: (message: string) => void;
}

/**
 * Renderiza um campo configurado pelo ADMIN.
 *
 * Usado no formulario publico, na pre-visualizacao e na edicao pelo painel,
 * garantindo que a previa seja fiel ao que a pessoa vera no celular.
 */
export function DynamicFieldInput({
  field,
  value,
  onChange,
  error,
  disabled = false,
  idPrefix = 'campo',
  allowCamera = false,
  onImageError,
}: DynamicFieldInputProps) {
  const id = `${idPrefix}-${field.id}`;
  const help = field.helpText || undefined;
  const described = describedBy(id, help, error);
  const invalid = Boolean(error);
  const chain = useLocationChain();

  // Estado, municipio e bairro viram listas encadeadas quando o formulario
  // esta dentro de `LocationProvider`. Sem ele, seguem os controles simples.
  if (
    chain &&
    (field.systemKey === 'state' ||
      field.systemKey === 'city' ||
      field.systemKey === 'district' ||
      field.systemKey === 'street')
  ) {
    return (
      <Field id={id} label={field.label} help={help} error={error} required={field.required}>
        <LocationField
          field={field}
          id={id}
          describedBy={described}
          invalid={invalid}
          disabled={disabled}
        />
      </Field>
    );
  }

  if (field.type === 'photo') {
    return (
      <Field id={id} label={field.label} help={help} error={error} required={field.required}>
        <PhotoUpload
          value={typeof value === 'string' ? value : null}
          onChange={(next) => onChange(next)}
          disabled={disabled}
          allowCamera={allowCamera}
          size="lg"
          showFormatHint={!help}
          onError={onImageError}
        />
      </Field>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <Field id={id} label={field.label} help={help} error={error} required={field.required} hideLabel>
        <Checkbox
          id={id}
          label={
            <span>
              {field.label}
              {field.required ? (
                <span aria-hidden="true" className="ml-1 text-danger-600">
                  *
                </span>
              ) : null}
            </span>
          }
          description={help}
          checked={value === true}
          disabled={disabled}
          aria-describedby={described}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
      </Field>
    );
  }

  if (field.type === 'multiselect') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <Field id={id} label={field.label} help={help} error={error} required={field.required}>
        <div
          role="group"
          aria-labelledby={id}
          aria-describedby={described}
          className={cn(
            'space-y-1 rounded-control border border-line-strong p-2',
            invalid && 'border-danger-600',
          )}
        >
          {field.options.map((option) => (
            <Checkbox
              key={option.id}
              id={`${id}-${option.id}`}
              label={option.label || 'Opção sem título'}
              checked={selected.includes(option.id)}
              disabled={disabled}
              onChange={(event) => {
                onChange(
                  event.target.checked
                    ? [...selected, option.id]
                    : selected.filter((item) => item !== option.id),
                );
              }}
            />
          ))}
        </div>
      </Field>
    );
  }

  if (field.systemKey === 'relationship') {
    return (
      <Field id={id} label={field.label} help={help} error={error} required={field.required}>
        <RelationshipPicker
          idPrefix={id}
          label={field.label}
          options={field.options}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          invalid={invalid}
          describedBy={described}
          onChange={(next) => onChange(next)}
        />
      </Field>
    );
  }

  if (field.type === 'select') {
    // Genero e UF tem lista fixa do sistema; os demais usam as opcoes do ADMIN.
    const options =
      field.systemKey === 'gender'
        ? GENDER_OPTIONS
        : field.systemKey === 'state'
          ? UF_OPTIONS
          : field.options;

    const vazio =
      field.systemKey === 'state'
        ? 'Selecione o estado'
        : field.placeholder || 'Selecione uma opção';

    return (
      <Field id={id} label={field.label} help={help} error={error} required={field.required}>
        <Select
          id={id}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          invalid={invalid}
          aria-describedby={described}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{vazio}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label || 'Opção sem título'}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  if (field.type === 'textarea') {
    return (
      <Field id={id} label={field.label} help={help} error={error} required={field.required}>
        <Textarea
          id={id}
          rows={4}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          disabled={disabled}
          invalid={invalid}
          aria-describedby={described}
          onChange={(event) => onChange(event.target.value)}
        />
      </Field>
    );
  }

  const common = {
    id,
    disabled,
    invalid,
    placeholder: field.placeholder,
    'aria-describedby': described,
  };

  if (field.systemKey === 'cpf' || field.systemKey === 'voter_id') {
    const mask = field.systemKey === 'cpf' ? maskCpf : maskVoterId;
    return (
      <Field id={id} label={field.label} help={help} error={error} required={field.required}>
        <Input
          {...common}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={mask(typeof value === 'string' ? value : '')}
          onChange={(event) => onChange(mask(event.target.value))}
        />
      </Field>
    );
  }

  if (field.type === 'phone') {
    return (
      <Field id={id} label={field.label} help={help} error={error} required={field.required}>
        <Input
          {...common}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={maskPhone(typeof value === 'string' ? value : '')}
          onChange={(event) => onChange(maskPhone(event.target.value))}
        />
      </Field>
    );
  }

  const typeMap: Record<string, { type: string; inputMode?: 'email' | 'numeric' | 'text' }> = {
    email: { type: 'email', inputMode: 'email' },
    number: { type: 'number', inputMode: 'numeric' },
    date: { type: 'date' },
    text: { type: 'text' },
  };

  const config = typeMap[field.type] ?? typeMap.text;

  return (
    <Field id={id} label={field.label} help={help} error={error} required={field.required}>
      <Input
        {...common}
        type={config.type}
        inputMode={config.inputMode}
        autoCapitalize={field.type === 'email' ? 'none' : undefined}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
