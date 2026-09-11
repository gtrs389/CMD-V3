'use client';

import { Undo2 } from 'lucide-react';
import type { CustomField } from '@/lib/types';
import { OTHER_OPTION, withCurrentValue } from '@/lib/domain/location';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useLocationChain, type LocationKey } from './location-context';

interface LocationFieldProps {
  field: CustomField;
  id: string;
  describedBy?: string;
  invalid: boolean;
  disabled: boolean;
}

/** Textos de cada passo, para nao repetir rotulo em quatro lugares. */
const TEXTS: Record<LocationKey, { placeholder: string; search: string; other: string; hint: string; manual: string }> = {
  city: {
    placeholder: 'Selecione o município',
    search: 'Buscar município',
    other: 'Outro município',
    hint: 'Selecione o estado primeiro',
    manual: 'Digite o município',
  },
  district: {
    placeholder: 'Selecione o bairro',
    search: 'Buscar bairro',
    other: 'Outro bairro',
    hint: 'Selecione o município primeiro',
    manual: 'Digite o bairro',
  },
  street: {
    placeholder: 'Selecione a rua',
    search: 'Buscar rua',
    other: 'Outra rua',
    hint: 'Selecione o bairro primeiro',
    manual: 'Digite a rua',
  },
};

/**
 * Estado, Municipio, Bairro e Rua encadeados.
 *
 * O que e gravado nao muda: sigla da UF e os nomes. Valores antigos que a API
 * nao conhece mais seguem visiveis, e a opcao "Outro" permite digitar quando a
 * lista nao tem a localidade (ou nem existe lista).
 */
export function LocationField({ field, id, describedBy, invalid, disabled }: LocationFieldProps) {
  const chain = useLocationChain();
  if (!chain) return null;

  if (field.systemKey === 'state') {
    const options = withCurrentValue(
      chain.states.items.map((state) => ({ value: state.uf, label: `${state.name} (${state.uf})` })),
      chain.state,
    );

    return (
      <SearchableSelect
        id={id}
        value={chain.state}
        options={options}
        placeholder="Selecione o estado"
        searchPlaceholder="Buscar estado"
        onChange={chain.selectState}
        disabled={disabled}
        loading={chain.states.loading}
        error={chain.states.error}
        onRetry={chain.states.retry}
        invalid={invalid}
        describedBy={describedBy}
      />
    );
  }

  const key: LocationKey =
    field.systemKey === 'city' ? 'city' : field.systemKey === 'district' ? 'district' : 'street';

  const step = {
    city: {
      value: chain.city,
      list: chain.cities,
      names: chain.cities.items.map((item) => item.name),
      blocked: chain.cityBlocked,
      select: chain.selectCity,
    },
    district: {
      value: chain.district,
      list: chain.districts,
      names: chain.districts.items.map((item) => item.name),
      blocked: chain.districtBlocked,
      select: chain.selectDistrict,
    },
    street: {
      value: chain.street,
      list: chain.streets,
      names: chain.streets.items.map((item) => item.name),
      blocked: chain.streetBlocked,
      select: chain.selectStreet,
    },
  }[key];

  const texts = TEXTS[key];

  // Sem lista possivel (passo anterior digitado a mao) a digitacao e o unico
  // caminho: o campo ja aparece aberto, sem a volta para a lista.
  const listUnavailable = chain.manual[key] && !chain.chosenManual[key];

  if (chain.manual[key]) {
    return (
      <div className="space-y-1.5">
        <Input
          id={id}
          type="text"
          value={step.value}
          placeholder={texts.manual}
          disabled={disabled || step.blocked}
          invalid={invalid}
          aria-describedby={describedBy}
          autoComplete="off"
          onChange={(event) => step.select(event.target.value)}
        />

        {listUnavailable ? null : (
          <button
            type="button"
            onClick={() => {
              step.select('');
              chain.setManual(key, false);
            }}
            className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-brand-700 transition-colors hover:text-brand-800"
          >
            <Undo2 aria-hidden="true" className="size-3.5" />
            Voltar para a lista
          </button>
        )}
      </div>
    );
  }

  // A opcao de digitar fica sempre no fim, mesmo com a lista vazia ou com
  // falha na consulta: nada impede o cadastro de continuar.
  const options = [
    ...withCurrentValue(
      step.names.map((name) => ({ value: name, label: name })),
      step.value,
    ),
    { value: OTHER_OPTION, label: texts.other },
  ];

  return (
    <SearchableSelect
      id={id}
      value={step.value}
      options={options}
      placeholder={texts.placeholder}
      searchPlaceholder={texts.search}
      onChange={(next) => {
        if (next === OTHER_OPTION) {
          step.select('');
          chain.setManual(key, true);
          return;
        }
        step.select(next);
      }}
      disabled={disabled || step.blocked}
      disabledHint={step.blocked ? texts.hint : undefined}
      loading={step.list.loading}
      error={step.list.error}
      onRetry={step.list.retry}
      onFallback={() => chain.setManual(key, true)}
      fallbackLabel={texts.other}
      invalid={invalid}
      describedBy={describedBy}
    />
  );
}
