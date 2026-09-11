'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { CustomField, SystemFieldKey } from '@/lib/types';
import {
  citiesPath,
  districtsPath,
  selectCity,
  selectState,
  statesPath,
  type CityOption,
  type DistrictOption,
  type StateOption,
} from '@/lib/domain/location';
import type { LocationSelection } from '@/lib/domain/location';
import type { DynamicFormValues, DynamicValue } from '@/lib/validation/dynamic-form';

/**
 * Encadeamento Estado -> Municipio -> Bairro.
 *
 * As listas vem das rotas internas em `/api/localidades`: o navegador nunca
 * fala com a API externa. O identificador do municipio existe apenas aqui,
 * durante o preenchimento; no banco continuam a sigla da UF e os nomes.
 */

export interface ListState<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

interface LocationContextValue {
  state: string;
  city: string;
  district: string;
  states: ListState<StateOption>;
  cities: ListState<CityOption>;
  districts: ListState<DistrictOption>;
  /** Verdadeiro quando o passo anterior ainda nao foi escolhido. */
  cityBlocked: boolean;
  districtBlocked: boolean;
  selectState: (uf: string) => void;
  selectCity: (name: string) => void;
  selectDistrict: (name: string) => void;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export function useLocationChain(): LocationContextValue | null {
  return useContext(LocationContext);
}

const FAILURE = 'Não foi possível carregar as localidades.';

/**
 * Consulta uma rota interna e mantem o estado de carregamento e erro.
 * O resultado guarda o caminho a que pertence: enquanto ele nao chega, a
 * lista anterior nao aparece e o campo mostra o carregamento.
 */
function useLocationList<T>(path: string | null): ListState<T> {
  const [result, setResult] = useState<{ path: string; items: T[]; error: string | null } | null>(
    null,
  );
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;

    let active = true;

    fetch(path, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(FAILURE);
        return (await response.json()) as { items?: T[] };
      })
      .then((payload) => {
        if (!active) return;
        setResult({ path, items: Array.isArray(payload.items) ? payload.items : [], error: null });
      })
      .catch(() => {
        if (active) setResult({ path, items: [], error: FAILURE });
      });

    return () => {
      active = false;
    };
  }, [path, tick]);

  const retry = useCallback(() => setTick((value) => value + 1), []);
  const ready = Boolean(path) && result?.path === path;

  return {
    items: ready ? (result?.items ?? []) : [],
    loading: Boolean(path) && !ready,
    error: ready ? (result?.error ?? null) : null,
    retry,
  };
}

interface LocationProviderProps {
  fields: CustomField[];
  values: DynamicFormValues;
  setValue: (fieldId: string, value: DynamicValue) => void;
  children: ReactNode;
}

function fieldId(fields: CustomField[], key: SystemFieldKey): string | null {
  return fields.find((field) => field.systemKey === key)?.id ?? null;
}

function text(value: DynamicValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

export function LocationProvider({ fields, values, setValue, children }: LocationProviderProps) {
  const ids = useMemo(
    () => ({
      state: fieldId(fields, 'state'),
      city: fieldId(fields, 'city'),
      district: fieldId(fields, 'district'),
    }),
    [fields],
  );

  const state = ids.state ? text(values[ids.state]) : '';
  const city = ids.city ? text(values[ids.city]) : '';
  const district = ids.district ? text(values[ids.district]) : '';

  const states = useLocationList<StateOption>(ids.state ? statesPath() : null);
  const cities = useLocationList<CityOption>(ids.city && state ? citiesPath(state) : null);

  /**
   * Os bairros sao pedidos pela UF e pelo nome do municipio: o identificador
   * da Brasil Aberto e resolvido no servidor. Municipio antigo que a API nao
   * conhece mais simplesmente nao traz bairros, e o valor gravado permanece.
   */
  const districts = useLocationList<DistrictOption>(
    ids.district && state && city ? districtsPath(state, city) : null,
  );

  const value = useMemo<LocationContextValue>(() => {
    // O identificador nao e guardado aqui: quem resolve o municipio e o servidor.
    const current: LocationSelection = { state, city, cityId: null, district };

    const apply = (next: LocationSelection) => {
      if (ids.state && next.state !== state) setValue(ids.state, next.state);
      if (ids.city && next.city !== city) setValue(ids.city, next.city);
      if (ids.district && next.district !== district) setValue(ids.district, next.district);
    };

    return {
      state,
      city,
      district,
      states,
      cities,
      districts,
      cityBlocked: !state,
      districtBlocked: !state || !city,
      selectState: (uf) => apply(selectState(current, uf)),
      selectCity: (name) => {
        const found = cities.items.find((option) => option.name === name) ?? null;
        // Sem correspondencia na lista (valor antigo): guarda o nome sem id.
        apply(found ? selectCity(current, found) : { ...current, city: name, cityId: null, district: '' });
      },
      selectDistrict: (name) => {
        if (ids.district) setValue(ids.district, name);
      },
    };
  }, [state, city, district, states, cities, districts, ids, setValue]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}
