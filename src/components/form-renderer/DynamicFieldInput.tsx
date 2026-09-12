'use client';

import type { ReactNode } from 'react';
import {
  AtSign,
  Calendar,
  CircleMinus,
  Fingerprint,
  Hash,
  Home,
  Landmark,
  MapPin,
  Phone,
  Signpost,
  User,
  Users,
} from 'lucide-react';
import type { CustomField } from '@/lib/types';
import type { DynamicValue } from '@/lib/validation/dynamic-form';
import { maskPhone } from '@/lib/utils/phone';
import {
  GENDER_OPTIONS,
  UF_OPTIONS,
  maskCpf,
  maskVoterId,
  normalizeSection,
  normalizeZone,
} from '@/lib/utils/documents';
import { cn } from '@/lib/utils/cn';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field, describedBy } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { LocationField } from './LocationField';
import { useLocationChain } from './location-context';
import { RadioCardGroup } from './RadioCardGroup';
import { RelationshipPicker } from './RelationshipPicker';

interface DynamicFieldInputProps {
  field: CustomField;
  value: DynamicValue;
  onChange: (value: DynamicValue) => void;
  /** Disparado ao sair do campo. Usado hoje so por CPF e título de eleitor. */
  onBlur?: (value: DynamicValue) => void;
  error?: string;
  disabled?: boolean;
  /** Diferencia os IDs quando o mesmo campo aparece em mais de um lugar. */
  idPrefix?: string;
  allowCamera?: boolean;
  onImageError?: (message: string) => void;
  /**
   * `invite`: apresentacao da pagina publica de cadastro — foto em circulo
   * tracejado e genero em cartoes de escolha. O painel administrativo segue
   * com `default`.
   */
  variant?: 'default' | 'invite';
}

/**
 * Icone de cada campo, na pagina publica.
 *
 * Puramente decorativo: da uma pista rapida do que o campo pede sem substituir
 * o rotulo. Campo personalizado do ADMIN nao recebe icone — inventar um
 * simbolo para uma pergunta que so ele conhece diria mais errado do que certo.
 */
function fieldIcon(field: CustomField): ReactNode {
  const classe = 'size-4';

  switch (field.systemKey) {
    case 'name':
      return <User className={classe} />;
    case 'phone':
      return <Phone className={classe} />;
    case 'cpf':
      return <Fingerprint className={classe} />;
    case 'voter_id':
      return <Hash className={classe} />;
    case 'zone':
      return <MapPin className={classe} />;
    case 'section':
      return <Hash className={classe} />;
    case 'city':
      return <Landmark className={classe} />;
    case 'district':
      return <Home className={classe} />;
    case 'street':
      return <Signpost className={classe} />;
    default:
      break;
  }

  if (field.type === 'email') return <AtSign className={classe} />;
  if (field.type === 'phone') return <Phone className={classe} />;
  if (field.type === 'date') return <Calendar className={classe} />;
  if (field.type === 'number') return <Hash className={classe} />;
  return null;
}

/** Cartoes de genero: icone e cor de cada opcao, como no desenho. */
const GENDER_TILES: Record<string, { icon: ReactNode; tone: 'sky' | 'rose' | 'violet' | 'neutral' }> = {
  HOMEM: { icon: <User className="size-5" />, tone: 'sky' },
  MULHER: { icon: <User className="size-5" />, tone: 'rose' },
  OUTRO: { icon: <Users className="size-5" />, tone: 'violet' },
  NAO_INFORMAR: { icon: <CircleMinus className="size-5" />, tone: 'neutral' },
};

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
  onBlur,
  error,
  disabled = false,
  idPrefix = 'campo',
  allowCamera = false,
  onImageError,
  variant = 'default',
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
          appearance={variant === 'invite' ? 'invite' : 'default'}
          onError={onImageError}
        />
      </Field>
    );
  }

  // Genero na pagina publica: cartoes de escolha, como no desenho do convite.
  if (variant === 'invite' && field.systemKey === 'gender') {
    return (
      <Field id={id} label={field.label} help={help} error={error} required={field.required}>
        <RadioCardGroup
          idPrefix={id}
          label={field.label}
          appearance="tile"
          options={GENDER_OPTIONS.map((option) => ({
            ...option,
            icon: GENDER_TILES[option.id]?.icon,
            tone: GENDER_TILES[option.id]?.tone,
          }))}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          invalid={invalid}
          describedBy={described}
          onChange={(next) => onChange(next)}
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
    // Somente na pagina publica: o painel segue com os campos limpos.
    leading: variant === 'invite' ? fieldIcon(field) : undefined,
  };

  if (
    field.systemKey === 'cpf' ||
    field.systemKey === 'voter_id' ||
    field.systemKey === 'zone' ||
    field.systemKey === 'section'
  ) {
    const mask =
      field.systemKey === 'cpf'
        ? maskCpf
        : field.systemKey === 'voter_id'
          ? maskVoterId
          : field.systemKey === 'zone'
            ? normalizeZone
            : normalizeSection;
    return (
      <Field id={id} label={field.label} help={help} error={error} required={field.required}>
        <Input
          {...common}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={mask(typeof value === 'string' ? value : '')}
          onChange={(event) => onChange(mask(event.target.value))}
          onBlur={(event) => onBlur?.(mask(event.target.value))}
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
