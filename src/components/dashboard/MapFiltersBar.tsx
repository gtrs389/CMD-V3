'use client';

import { FilterX, MapPin, X } from 'lucide-react';
import {
  MIN_VOTES_STEPS,
  activeFilterCount,
  clearFilters,
  type MapOptions,
  type MapQuery,
} from '@/lib/domain/map-filters';
import { MAP_FILTERS, MAP_FILTER_LABELS } from '@/lib/domain/map-pin';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/text';
import { Dropdown } from '@/components/ui/Dropdown';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';

/**
 * Os recortes do mapa.
 *
 * Duas linhas, e a ordem e a da pergunta que a campanha faz: primeiro O QUE
 * aparece (pessoas, locais de votacao ou os dois), depois ONDE (estado,
 * cidade, zona) e por fim QUANTO (tamanho minimo do local). O Lider fica ao
 * lado da busca: escolhido, o mapa inteiro passa a contar so quem ele
 * cadastrou, escola por escola.
 *
 * As opcoes de estado, cidade e zona nao sao listas fixas: vem dos proprios
 * dados, entao nenhum filtro daqui pode devolver mapa vazio por escolha
 * impossivel. Trocar o estado limpa a cidade, porque a cidade anterior nao
 * existe mais na lista nova.
 *
 * Este componente nao filtra nada: quem filtra e `@/lib/domain/map-filters`,
 * e o mesmo recorte alimenta o mapa e o ranking. Dois lugares calculando o
 * mesmo numero acabariam mostrando numeros diferentes.
 */

interface MapFiltersBarProps {
  query: MapQuery;
  onChange: (query: MapQuery) => void;
  options: MapOptions;
  /** Compacto no cabecalho do cartao, espacado na tela cheia. */
  dense?: boolean;
  /**
   * Varios municipios de uma vez (a votacao no mapa): a cidade vira uma
   * escolha multipla, e os escolhidos aparecem em etiquetas para tirar.
   */
  municipiosMultiplos?: boolean;
}

export function MapFiltersBar({ query, onChange, options, dense = false, municipiosMultiplos = false }: MapFiltersBarProps) {
  const ativos = activeFilterCount(query);
  const municipios = query.cities ?? [];
  const alternarMunicipio = (cidade: string) =>
    onChange({
      ...query,
      city: null,
      cities: municipios.includes(cidade) ? municipios.filter((c) => c !== cidade) : [...municipios, cidade],
    });

  return (
    <div className={cn('space-y-2', dense ? 'space-y-2' : 'space-y-3')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <div role="group" aria-label="Tipo de localização" className="flex flex-wrap gap-1.5">
          {MAP_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={query.kind === option}
              onClick={() => onChange({ ...query, kind: option })}
              className={cn(
                'inline-flex min-h-9 items-center rounded-pill border px-3 text-xs font-medium transition-colors',
                query.kind === option
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : 'border-line bg-surface text-ink-700 hover:bg-ink-50',
              )}
            >
              {MAP_FILTER_LABELS[option]}
            </button>
          ))}
        </div>

        {ativos > 0 ? (
          <button
            type="button"
            onClick={() => onChange(clearFilters(query))}
            className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-line px-3 text-xs font-medium text-ink-700 transition-colors hover:bg-ink-50"
          >
            <FilterX aria-hidden="true" className="size-3.5" />
            Limpar filtros
            <span className="rounded-pill bg-brand-50 px-1.5 font-semibold text-brand-700 tabular-nums">
              {ativos}
            </span>
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SearchInput
          id="mapa-busca"
          label="Buscar pessoa, escola, rua ou bairro"
          placeholder="Buscar no mapa"
          value={query.search}
          onChange={(search) => onChange({ ...query, search })}
          className="col-span-2 sm:col-span-4 lg:col-span-2"
        />

        {options.leaders.length > 0 ? (
          <Dropdown
            aria-label="Líder"
            value={query.leader ?? ''}
            highlighted={Boolean(query.leader)}
            searchPlaceholder="Buscar líder"
            options={[
              { value: '', label: 'Todos os líderes' },
              ...options.leaders.map((l) => ({
                value: l.id,
                label: `${l.name} · ${formatNumber(l.people)} ${l.people === 1 ? 'pessoa' : 'pessoas'} em ${formatNumber(l.places)} ${l.places === 1 ? 'escola' : 'escolas'}`,
              })),
            ]}
            onChange={(leader) => onChange({ ...query, leader: leader || null })}
            className="col-span-2 sm:col-span-4 lg:col-span-2"
          />
        ) : null}

        <Select
          aria-label="Estado"
          value={query.state ?? ''}
          // Trocar o estado invalida a cidade escolhida: ela pode nao existir
          // na lista nova, e um filtro invisivel esvaziaria o mapa sem
          // explicacao.
          onChange={(event) =>
            onChange({ ...query, state: event.target.value || null, city: null, cities: [] })
          }
        >
          <option value="">Todos os estados</option>
          {options.states.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </Select>

        {municipiosMultiplos ? (
          <Dropdown
            aria-label="Municípios"
            options={options.cities.map((cidade) => ({ value: cidade, label: cidade }))}
            highlighted={municipios.length > 0}
            searchPlaceholder="Buscar município"
            searchThreshold={6}
            multiple={{
              selected: municipios,
              onToggle: alternarMunicipio,
              resumo:
                municipios.length === 0
                  ? 'Todos os municípios'
                  : municipios.length === 1
                    ? municipios[0]
                    : `${municipios.length} municípios`,
            }}
          />
        ) : (
          <Select
            aria-label="Cidade"
            value={query.city ?? ''}
            onChange={(event) => onChange({ ...query, city: event.target.value || null })}
          >
            <option value="">Todas as cidades</option>
            {options.cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </Select>
        )}

        <Select
          aria-label="Zona eleitoral"
          value={query.zone ?? ''}
          onChange={(event) => onChange({ ...query, zone: event.target.value || null })}
        >
          <option value="">Todas as zonas</option>
          {options.zones.map((zone) => (
            <option key={zone} value={zone}>
              Zona {zone}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Tamanho mínimo do local de votação"
          value={String(query.minVotes)}
          onChange={(event) => onChange({ ...query, minVotes: Number(event.target.value) })}
        >
          {MIN_VOTES_STEPS.map((step) => (
            <option key={step} value={step}>
              {step === 0 ? 'Qualquer tamanho' : `A partir de ${step} votos`}
            </option>
          ))}
        </Select>
      </div>

      {/* Os municipios escolhidos, inteiros, cada um com o X para tirar. */}
      {municipiosMultiplos && municipios.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Municípios escolhidos">
          <span className="flex items-center gap-1 text-xs font-semibold text-ink-700">
            <MapPin aria-hidden="true" className="size-3.5 text-accent-600" />
            {municipios.length === 1 ? 'Município:' : `${municipios.length} municípios:`}
          </span>
          {municipios.map((cidade) => (
            <button
              key={cidade}
              type="button"
              onClick={() => alternarMunicipio(cidade)}
              title={`Tirar ${cidade}`}
              className="cmd-chip-entra inline-flex min-h-8 items-center gap-1.5 rounded-pill border border-accent-100 bg-accent-50 px-2.5 text-left text-xs font-semibold text-accent-700 transition-colors hover:border-accent-600"
            >
              {cidade}
              <X aria-hidden="true" className="size-3 shrink-0" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...query, cities: [] })}
            className="inline-flex min-h-8 items-center rounded-pill px-2 text-xs font-medium text-ink-500 hover:text-ink-900"
          >
            Todos os municípios
          </button>
        </div>
      ) : null}
    </div>
  );
}
