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
  CHAIN_ORDER,
  citiesPath,
  clearFrom,
  districtsPath,
  forcedManual,
  statesPath,
  streetsPath,
  type CityOption,
  type DistrictOption,
  type StateOption,
  type StreetOption,
} from '@/lib/domain/location';
import type { DynamicFormValues, DynamicValue } from '@/lib/validation/dynamic-form';

/**
 * Encadeamento Estado -> Municipio -> Bairro -> Rua.
 *
 * As listas vem das rotas internas em `/api/localidades`: o navegador nunca
 * fala com a API externa. Os identificadores da API vivem apenas aqui,
 * durante o preenchimento; no banco ficam a sigla da UF e os nomes.
 *
 * Quando um passo nao tem lista (municipio ou bairro digitado a mao, ou a API
 * indisponivel), os campos seguintes passam a aceitar digitacao livre: o
 * cadastro nunca fica impedido por causa da API.
 */

export type LocationKey = 'city' | 'district' | 'street';

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
  street: string;
  states: ListState<StateOption>;
  cities: ListState<CityOption>;
  districts: ListState<DistrictOption>;
  streets: ListState<StreetOption>;
  /** Verdadeiro quando o passo anterior ainda nao foi escolhido. */
  cityBlocked: boolean;
  districtBlocked: boolean;
  streetBlocked: boolean;
  /** Campos em digitacao livre, ja com a cascata aplicada. */
  manual: Record<LocationKey, boolean>;
  /** Escolha explicita de quem preenche, sem a cascata. */
  chosenManual: Record<LocationKey, boolean>;
  setManual: (key: LocationKey, manual: boolean) => void;
  selectState: (uf: string) => void;
  selectCity: (name: string) => void;
  selectDistrict: (name: string) => void;
  selectStreet: (name: string) => void;
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
      street: fieldId(fields, 'street'),
    }),
    [fields],
  );

  const state = ids.state ? text(values[ids.state]) : '';
  const city = ids.city ? text(values[ids.city]) : '';
  const district = ids.district ? text(values[ids.district]) : '';
  const street = ids.street ? text(values[ids.street]) : '';

  /** Bairro escolhido na lista: o identificador nunca sai da memoria. */
  const [districtId, setDistrictId] = useState<number | null>(null);
  const [chosen, setChosen] = useState<Record<LocationKey, boolean>>({
    city: false,
    district: false,
    street: false,
  });

  // A escolha de um passo obriga os seguintes: sem id nao existe lista.
  const manual = useMemo(() => forcedManual(chosen), [chosen]);

  const states = useLocationList<StateOption>(ids.state ? statesPath() : null);
  const cities = useLocationList<CityOption>(
    ids.city && state && !manual.city ? citiesPath(state) : null,
  );

  /**
   * Os bairros sao pedidos pela UF e pelo nome do municipio: o identificador
   * da Brasil Aberto e resolvido no servidor. Municipio digitado a mao nao
   * tem lista, e o bairro passa a ser digitado tambem.
   */
  const districts = useLocationList<DistrictOption>(
    ids.district && state && city && !manual.city && !manual.district
      ? districtsPath(state, city)
      : null,
  );

  const streets = useLocationList<StreetOption>(
    ids.street && districtId && !manual.district && !manual.street
      ? streetsPath({ id: districtId })
      : null,
  );

  const setManual = useCallback(
    (key: LocationKey, value: boolean) => {
      setChosen((current) => ({ ...current, [key]: value }));
    },
    [setChosen],
  );

  const value = useMemo<LocationContextValue>(() => {
    const write = (key: 'state' | LocationKey, next: string) => {
      const id = ids[key];
      if (id) setValue(id, next);
    };

    /** Limpa os campos seguintes e devolve cada um para a lista. */
    const clear = (key: LocationKey) => {
      const limpo = clearFrom({ state, city, district, street }, key);
      for (const step of CHAIN_ORDER.slice(CHAIN_ORDER.indexOf(key))) {
        write(step, limpo[step]);
        setManual(step, false);
      }
      setDistrictId(null);
    };

    return {
      state,
      city,
      district,
      street,
      states,
      cities,
      districts,
      streets,
      cityBlocked: !state,
      districtBlocked: !state || !city,
      streetBlocked: !city || !district,
      manual,
      chosenManual: chosen,
      setManual,

      // Trocar um passo limpa todos os seguintes; repetir a mesma escolha nao
      // apaga nada, para que a edicao de um cadastro antigo continue intacta.
      selectState: (uf) => {
        if (uf === state) return;
        write('state', uf);
        clear('city');
      },
      selectCity: (name) => {
        if (name === city) return;
        write('city', name);
        clear('district');
      },
      selectDistrict: (name) => {
        if (name === district) return;
        write('district', name);
        write('street', '');
        setManual('street', false);
        // O identificador vem da propria lista; nome digitado nao tem id.
        setDistrictId(districts.items.find((item) => item.name === name)?.id ?? null);
      },
      selectStreet: (name) => write('street', name),
    };
  }, [
    state,
    city,
    district,
    street,
    states,
    cities,
    districts,
    streets,
    manual,
    chosen,
    setManual,
    setDistrictId,
    ids,
    setValue,
  ]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}
