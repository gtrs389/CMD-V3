'use client';

import { PencilLine, RotateCw, Undo2 } from 'lucide-react';
import type { CustomField } from '@/lib/types';
import { withCurrentValue } from '@/lib/domain/location';
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
const TEXTS: Record<
  LocationKey,
  { placeholder: string; search: string; other: string; notFound: string; hint: string; manual: string }
> = {
  city: {
    placeholder: 'Selecione seu município...',
    search: 'Buscar município',
    other: 'Outro município',
    notFound: 'Não encontrei meu município',
    hint: 'Escolha o estado primeiro',
    manual: 'Digite o município',
  },
  district: {
    placeholder: 'Selecione seu bairro...',
    search: 'Buscar bairro',
    other: 'Outro bairro',
    notFound: 'Não encontrei meu bairro',
    hint: 'Escolha o município primeiro',
    manual: 'Digite o bairro',
  },
  street: {
    placeholder: 'Selecione sua rua...',
    search: 'Buscar rua',
    other: 'Outra rua',
    notFound: 'Não encontrei minha rua',
    hint: 'Escolha o bairro primeiro',
    manual: 'Digite a rua',
  },
};

/**
 * Estado, Municipio, Bairro e Rua encadeados.
 *
 * O que e gravado nao muda: sigla da UF e os nomes. Valores antigos que a API
 * nao conhece mais seguem visiveis, e sempre existe um caminho para digitar
 * quando a lista nao tem a localidade (ou nem existe lista).
 *
 * Esse caminho fica FORA da lista, em um botao logo abaixo do campo. Dentro
 * do menu ele se perdia: quem nao achava a propria rua rolava a lista, nao
 * encontrava, e nao tinha como saber que a saida estava no fim daquelas
 * centenas de nomes — a pessoa desistia achando que o cadastro nao aceitava
 * o endereco dela.
 */
export function LocationField({ field, id, describedBy, invalid, disabled }: LocationFieldProps) {
  const chain = useLocationChain();
  if (!chain) return null;

  if (field.systemKey === 'state') {
    // Lista fora do ar: o campo vira texto, com a UF que ja estava escrita.
    if (chain.states.error) {
      return (
        <ListaIndisponivel
          id={id}
          value={chain.state}
          placeholder="Sigla do estado (ex.: AL)"
          disabled={disabled}
          invalid={invalid}
          describedBy={describedBy}
          onChange={(valor) => chain.selectState(valor.toUpperCase().slice(0, 2))}
          onRetry={chain.states.retry}
        />
      );
    }

    const options = withCurrentValue(
      chain.states.items.map((state) => ({ value: state.uf, label: `${state.name} (${state.uf})` })),
      chain.state,
    );

    return (
      <SearchableSelect
        id={id}
        value={chain.state}
        options={options}
        placeholder="Selecione seu estado..."
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

  // Lista fora do ar: o campo vira texto, ja com o que estava escolhido.
  // Uma caixa de erro no lugar do valor escondia, por exemplo, o municipio
  // fixo da planilha — e dava a impressao de que ele tinha sumido.
  if (step.list.error) {
    return (
      <ListaIndisponivel
        id={id}
        value={step.value}
        placeholder={texts.manual}
        disabled={disabled || step.blocked}
        invalid={invalid}
        describedBy={describedBy}
        onChange={step.select}
        onRetry={step.list.retry}
      />
    );
  }

  // Somente as localidades. A saida para digitar nao entra aqui: ela e o
  // botao abaixo do campo.
  const options = withCurrentValue(
    step.names.map((name) => ({ value: name, label: name })),
    step.value,
  );

  return (
    <div className="space-y-1.5">
      <SearchableSelect
        id={id}
        value={step.value}
        options={options}
        placeholder={texts.placeholder}
        searchPlaceholder={texts.search}
        onChange={step.select}
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

      {/* Sempre a vista, e nunca dentro do menu. Enquanto o passo anterior
          nao foi escolhido nao ha o que digitar, entao ele nao aparece. */}
      {step.blocked || disabled ? null : (
        <button
          type="button"
          onClick={() => {
            step.select('');
            chain.setManual(key, true);
          }}
          className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-brand-700 transition-colors hover:text-brand-800"
        >
          <PencilLine aria-hidden="true" className="size-3.5" />
          {texts.notFound}
        </button>
      )}
    </div>
  );
}

/**
 * O campo quando a lista de localidades nao carregou.
 *
 * O valor fica A VISTA e editavel, como texto: o cadastro nunca para por
 * causa da API, e o que ja estava escolhido nao some. Tentar a lista de
 * novo e um link discreto embaixo, e nao o assunto principal do campo.
 */
function ListaIndisponivel({
  id,
  value,
  placeholder,
  disabled,
  invalid,
  describedBy,
  onChange,
  onRetry,
}: {
  id: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  invalid: boolean;
  describedBy?: string;
  onChange: (valor: string) => void;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <Input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        invalid={invalid}
        aria-describedby={describedBy}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />

      {disabled ? null : (
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
          <span>A lista não carregou — pode digitar.</span>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-9 items-center gap-1.5 font-medium text-brand-700 transition-colors hover:text-brand-800"
          >
            <RotateCw aria-hidden="true" className="size-3.5" />
            Tentar carregar a lista
          </button>
        </p>
      )}
    </div>
  );
}
