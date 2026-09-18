'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { CustomField } from '@/lib/types';
import type { DynamicFormValues, DynamicValue } from '@/lib/validation/dynamic-form';
import { DynamicFieldInput } from '@/components/form-renderer/DynamicFieldInput';
import { LocationProvider, useLocationChain } from '@/components/form-renderer/location-context';

export interface EnderecoDaLinha {
  state: string;
  city: string;
  district: string;
  street: string;
}

interface ImportAddressFieldsProps {
  /** Identificador da linha, para os campos de cada pessoa nao colidirem. */
  id: string;
  endereco: EnderecoDaLinha;
  onChange: (endereco: EnderecoDaLinha) => void;
  disabled?: boolean;
}

/**
 * O endereco da conferencia da planilha: o MESMO da ficha.
 *
 * Nao e um texto digitado. E a escolha encadeada — Estado, depois Municipio,
 * depois Bairro, depois Rua —, cada passo dentro do anterior, com as listas
 * vindas de `/api/localidades` e a saida para digitar quando a localidade
 * nao aparece. E por isso que ele nao vem da planilha: um texto solto nao se
 * encaixa nessa cadeia.
 *
 * Os campos sao montados aqui porque a planilha nao tem formulario: o
 * `LocationProvider` e o `DynamicFieldInput` sao os mesmos que desenham o
 * cadastro, entao o que aparece na conferencia e, literalmente, o que
 * aparece na ficha.
 */
export function ImportAddressFields({ id, endereco, onChange, disabled }: ImportAddressFieldsProps) {
  /**
   * Os quatro campos, na ordem da cadeia.
   *
   * Nascem aqui, e nao do formulario do time, por um motivo: a planilha
   * cadastra pessoas de qualquer time e de qualquer formulario, e o endereco
   * e sempre esta cadeia. Os rotulos, os avisos e as listas sao os mesmos
   * que o construtor entrega por padrao.
   */
  const fields = useMemo<CustomField[]>(
    () => [
      {
        id: `${id}-state`,
        systemKey: 'state',
        type: 'select',
        label: 'Estado (UF)',
        placeholder: '',
        helpText: '',
        required: false,
        enabled: true,
        order: 0,
        options: [],
      },
      {
        id: `${id}-city`,
        systemKey: 'city',
        type: 'text',
        label: 'Município / Cidade',
        placeholder: 'Nome da cidade',
        helpText: '',
        required: false,
        enabled: true,
        order: 1,
        options: [],
      },
      {
        id: `${id}-district`,
        systemKey: 'district',
        type: 'text',
        label: 'Bairro',
        placeholder: 'Nome do bairro',
        helpText: '',
        required: false,
        enabled: true,
        order: 2,
        options: [],
      },
      {
        id: `${id}-street`,
        systemKey: 'street',
        type: 'text',
        label: 'Rua',
        placeholder: 'Nome da rua',
        helpText: '',
        required: false,
        enabled: true,
        order: 3,
        options: [],
      },
    ],
    [id],
  );

  const values: DynamicFormValues = useMemo(
    () => ({
      [`${id}-state`]: endereco.state,
      [`${id}-city`]: endereco.city,
      [`${id}-district`]: endereco.district,
      [`${id}-street`]: endereco.street,
    }),
    [id, endereco],
  );

  function setValue(fieldId: string, value: DynamicValue) {
    const texto = typeof value === 'string' ? value : '';

    if (fieldId === `${id}-state`) onChange({ ...endereco, state: texto });
    else if (fieldId === `${id}-city`) onChange({ ...endereco, city: texto });
    else if (fieldId === `${id}-district`) onChange({ ...endereco, district: texto });
    else if (fieldId === `${id}-street`) onChange({ ...endereco, street: texto });
  }

  // Bairro e rua que vieram da planilha sao texto de gente: "Conjunto
  // Brivaldo Medeiros", "QJ Nº 11", "Fazenda Canto". Quase nenhum deles esta
  // na lista oficial de bairros e ruas, e um campo de lista deixaria o valor
  // que a planilha trouxe invisivel — como se nao tivesse vindo.
  const daPlanilha = Boolean(endereco.district || endereco.street);

  return (
    <LocationProvider fields={fields} values={values} setValue={setValue}>
      {daPlanilha ? <AbrirParaDigitar /> : null}
      <div className="sm:col-span-2">
        <p className="text-sm font-semibold text-ink-900">Endereço</p>
        <p className="mt-0.5 mb-2 text-[0.8125rem] text-ink-500">
          Escolha na lista ou digite, se a sua localidade não aparecer.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <DynamicFieldInput
              key={field.id}
              field={field}
              value={values[field.id] ?? ''}
              onChange={(valor) => setValue(field.id, valor)}
              disabled={disabled}
              idPrefix={`planilha-${id}`}
            />
          ))}
        </div>
      </div>
    </LocationProvider>
  );
}

/**
 * Deixa bairro e rua abertos para digitar.
 *
 * Vive DENTRO do provedor porque e de la que vem `setManual` — e roda uma
 * vez, na montagem: depois disso quem manda e quem esta conferindo, que pode
 * voltar para a lista pelo botao do proprio campo.
 */
function AbrirParaDigitar() {
  const chain = useLocationChain();
  const aplicado = useRef(false);

  useEffect(() => {
    if (aplicado.current || !chain) return;
    aplicado.current = true;
    chain.setManual('district', true);
    chain.setManual('street', true);
  }, [chain]);

  return null;
}
