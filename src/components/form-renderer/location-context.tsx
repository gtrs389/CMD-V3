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
  findCity,
  selectCity,
  selectState,
  type CityOption,
  type DistrictOption,
  type StateOption,
} from '@/lib/domain/location';
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

  const [chosen, setChosen] = useState<{ id: number | null; ibge: number | null }>({
    id: null,
    ibge: null,
  });

  const states = useLocationList<StateOption>(ids.state ? '/api/localidades/estados' : null);
  const cities = useLocationList<CityOption>(
    ids.city && state ? `/api/localidades/municipios/${encodeURIComponent(state)}` : null,
  );
  /**
   * Codigo IBGE do municipio escolhido, usado so para buscar os bairros.
   *
   * Cadastro antigo: o municipio ja gravado e reconhecido dentro da lista
   * carregada, o que libera os bairros. Se a API nao o conhece mais, o valor
   * segue guardado e apenas os bairros ficam indisponiveis.
   */
  const chosenCity = useMemo(() => {
    if (chosen.id !== null || chosen.ibge !== null) return chosen;
    const found = city ? findCity(cities.items, city) : null;
    return { id: found?.id ?? null, ibge: found?.ibge ?? null };
  }, [chosen, city, cities.items]);

  const districtsPath = useMemo(() => {
    if (!ids.district) return null;
    const code = chosenCity.ibge ?? chosenCity.id;
    if (!code) return null;
    const query = chosenCity.id && chosenCity.id !== code ? `?cidade=${chosenCity.id}` : '';
    return `/api/localidades/bairros/${code}${query}`;
  }, [ids.district, chosenCity]);

  const districts = useLocationList<DistrictOption>(districtsPath);

  const value = useMemo<LocationContextValue>(() => {
    const current = {
      state,
      city,
      cityId: chosenCity.id,
      cityIbge: chosenCity.ibge,
      district,
    };

    const apply = (next: typeof current) => {
      if (ids.state && next.state !== state) setValue(ids.state, next.state);
      if (ids.city && next.city !== city) setValue(ids.city, next.city);
      if (ids.district && next.district !== district) setValue(ids.district, next.district);
      setChosen({ id: next.cityId, ibge: next.cityIbge });
    };

    return {
      state,
      city,
      district,
      states,
      cities,
      districts,
      cityBlocked: !state,
      districtBlocked: !city || districtsPath === null,
      selectState: (uf) => apply(selectState(current, uf)),
      selectCity: (name) => {
        const found = cities.items.find((option) => option.name === name) ?? null;
        // Sem correspondencia na lista (valor antigo): guarda o nome sem id.
        apply(
          found
            ? selectCity(current, found)
            : { ...current, city: name, cityId: null, cityIbge: null, district: '' },
        );
      },
      selectDistrict: (name) => {
        if (ids.district) setValue(ids.district, name);
      },
    };
  }, [state, city, district, chosenCity, districtsPath, states, cities, districts, ids, setValue]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}
