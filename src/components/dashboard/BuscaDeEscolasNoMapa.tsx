'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { MapPin, School, Search, X } from 'lucide-react';
import { buscarEscolas, type EscolaNaBusca } from '@/lib/domain/busca-de-escolas';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/text';

/**
 * "Buscar escola", sobre o proprio mapa: digita, aparecem as escolas que
 * batem (nome, endereco ou cidade, sem acento), e escolher uma leva o mapa
 * ate ela e a abre. Setas e Enter escolhem pelo teclado; Esc limpa.
 */
export function BuscaDeEscolasNoMapa<T extends EscolaNaBusca>({
  escolas,
  rotuloDoValor,
  onEscolher,
}: {
  escolas: readonly T[];
  /** O que o numero de cada escola conta: "pessoas" (campanha) ou "votos" (votacao). */
  rotuloDoValor: string;
  onEscolher: (escola: T) => void;
}) {
  const [termo, setTermo] = useState('');
  const [aberta, setAberta] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const lista = useId();
  const campo = useRef<HTMLInputElement>(null);
  const achadas = useMemo(() => buscarEscolas(escolas, termo, 8), [escolas, termo]);
  const mostrar = aberta && termo.trim().length > 0;

  function escolher(e: T) {
    onEscolher(e);
    setAberta(false);
    setTermo(e.titulo);
    campo.current?.blur();
  }

  return (
    <div className="pointer-events-auto absolute top-3 left-3 z-[1200] w-[min(24rem,calc(100%-10rem))] min-w-[11rem]">
      <label className="relative flex items-center">
        <span className="sr-only">Buscar escola no mapa</span>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 z-10 size-4 text-ink-500" />
        <input
          ref={campo}
          type="search"
          role="combobox"
          aria-expanded={mostrar}
          aria-controls={lista}
          aria-autocomplete="list"
          value={termo}
          placeholder="Buscar escola"
          onChange={(e) => {
            setTermo(e.target.value);
            setAberta(true);
            setAtivo(0);
          }}
          onFocus={() => setAberta(true)}
          onBlur={() => window.setTimeout(() => setAberta(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setAtivo((i) => Math.min(i + 1, achadas.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setAtivo((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && achadas[ativo]) {
              e.preventDefault();
              escolher(achadas[ativo]);
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              setTermo('');
              setAberta(false);
            }
          }}
          className="min-h-10 w-full rounded-pill border border-line bg-surface/95 pr-9 pl-9 text-sm text-ink-900 shadow-card backdrop-blur placeholder:text-ink-500 focus:border-accent-600 focus:ring-4 focus:ring-accent-100 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {termo ? (
          <button
            type="button"
            onClick={() => {
              setTermo('');
              campo.current?.focus();
            }}
            aria-label="Limpar busca"
            className="absolute right-1.5 z-10 flex size-7 items-center justify-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-900"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        ) : null}
      </label>

      {mostrar ? (
        <ul
          id={lista}
          role="listbox"
          className="mt-1.5 max-h-80 animate-fade-in overflow-y-auto rounded-card border border-line bg-surface p-1 shadow-overlay"
        >
          {achadas.length === 0 ? (
            <li className="px-3 py-3 text-center text-xs text-ink-500">Nenhuma escola com esse nome neste mapa.</li>
          ) : (
            achadas.map((e, i) => (
              <li key={e.chave} role="option" aria-selected={i === ativo}>
                <button
                  type="button"
                  // mousedown: escolhe antes de o campo perder o foco.
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    escolher(e);
                  }}
                  onMouseEnter={() => setAtivo(i)}
                  className={cn(
                    'flex w-full min-w-0 items-center gap-2.5 rounded-control px-2.5 py-2 text-left transition-colors',
                    i === ativo ? 'bg-accent-50' : 'hover:bg-ink-50',
                  )}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-gold-400">
                    <School aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-900" title={e.titulo}>{e.titulo}</span>
                    <span className="flex items-center gap-1 truncate text-[0.6875rem] text-ink-500">
                      <MapPin aria-hidden="true" className="size-3 shrink-0" />
                      {[e.endereco, e.cidade].filter(Boolean).join(' · ') || 'Local de votação'}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-bold text-navy-900 tabular-nums">{formatNumber(e.valor)}</span>
                    <span className="block text-[0.625rem] text-ink-500">{rotuloDoValor}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
