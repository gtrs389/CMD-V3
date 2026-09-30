'use client';

import { Dropdown, type DropdownOption } from './Dropdown';

export type SelectOption = DropdownOption;

interface SearchableSelectProps {
  id: string;
  value: string;
  options: SelectOption[];
  placeholder: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Motivo do bloqueio, mostrado no lugar do texto de escolha. */
  disabledHint?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Caminho alternativo quando a lista falha (ex.: digitar o nome). */
  onFallback?: () => void;
  fallbackLabel?: string;
  invalid?: boolean;
  describedBy?: string;
  searchPlaceholder?: string;
  /** Abaixo deste total a busca nao aparece: a lista ja cabe na tela. */
  searchThreshold?: number;
}

/**
 * Lista suspensa com busca, para listas longas como municipios e bairros.
 *
 * O desenho e o da lista suspensa do sistema (`Dropdown`); aqui entram so
 * os estados de carga da lista: carregando, erro com "tentar de novo" e o
 * caminho alternativo de digitar.
 */
export function SearchableSelect({
  id,
  value,
  options,
  placeholder,
  onChange,
  disabled = false,
  disabledHint,
  loading = false,
  error = null,
  onRetry,
  onFallback,
  fallbackLabel,
  invalid = false,
  describedBy,
  searchPlaceholder = 'Pesquisar...',
  searchThreshold = 8,
}: SearchableSelectProps) {
  if (error) {
    return (
      <div
        // Sempre em coluna: o campo costuma estar numa grade de duas
        // colunas, e lado a lado o texto ficava espremido atras dos botoes.
        className="flex flex-col gap-2 rounded-control border border-danger-200 bg-danger-50 p-3"
        aria-describedby={describedBy}
      >
        <p role="alert" className="text-sm text-danger-700">
          {error}
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 items-center justify-center rounded-control border border-line-strong bg-surface px-3 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
            >
              Tentar novamente
            </button>
          ) : null}

          {onFallback ? (
            <button
              type="button"
              onClick={onFallback}
              className="inline-flex min-h-11 items-center justify-center rounded-control border border-line-strong bg-surface px-3 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
            >
              {fallbackLabel ?? 'Digitar'}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <Dropdown
      id={id}
      value={value}
      options={options}
      placeholder={placeholder}
      onChange={onChange}
      disabled={disabled}
      disabledHint={disabledHint}
      loading={loading}
      invalid={invalid}
      aria-describedby={describedBy}
      searchPlaceholder={searchPlaceholder}
      searchThreshold={searchThreshold}
    />
  );
}
