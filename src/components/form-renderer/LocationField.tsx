'use client';

import type { CustomField } from '@/lib/types';
import { withCurrentValue } from '@/lib/domain/location';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useLocationChain } from './location-context';

interface LocationFieldProps {
  field: CustomField;
  id: string;
  describedBy?: string;
  invalid: boolean;
  disabled: boolean;
}

/**
 * Estado, Municipio e Bairro em listas encadeadas.
 *
 * O que e gravado continua igual: sigla da UF, nome do municipio e nome do
 * bairro. Valores antigos que a API nao conhece mais seguem visiveis ate que
 * o ADMIN escolha outro.
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

  if (field.systemKey === 'city') {
    const options = withCurrentValue(
      chain.cities.items.map((city) => ({ value: city.name, label: city.name })),
      chain.city,
    );

    return (
      <SearchableSelect
        id={id}
        value={chain.city}
        options={options}
        placeholder="Selecione o município"
        searchPlaceholder="Buscar município"
        onChange={chain.selectCity}
        disabled={disabled || chain.cityBlocked}
        disabledHint={chain.cityBlocked ? 'Selecione o estado primeiro' : undefined}
        loading={chain.cities.loading}
        error={chain.cities.error}
        onRetry={chain.cities.retry}
        invalid={invalid}
        describedBy={describedBy}
      />
    );
  }

  const options = withCurrentValue(
    chain.districts.items.map((district) => ({ value: district.name, label: district.name })),
    chain.district,
  );

  return (
    <SearchableSelect
      id={id}
      value={chain.district}
      options={options}
      placeholder="Selecione o bairro"
      searchPlaceholder="Buscar bairro"
      onChange={chain.selectDistrict}
      disabled={disabled || chain.districtBlocked}
      disabledHint={chain.districtBlocked ? 'Selecione o município primeiro' : undefined}
      loading={chain.districts.loading}
      error={chain.districts.error}
      onRetry={chain.districts.retry}
      invalid={invalid}
      describedBy={describedBy}
    />
  );
}
