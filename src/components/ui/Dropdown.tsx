'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { matchesSearch } from '@/lib/utils/text';
import { Spinner } from './Spinner';

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface DropdownProps {
  id?: string;
  /** Escolha atual. No modo `multiple`, as marcadas vem de `multiple`. */
  value?: string;
  options: DropdownOption[];
  onChange?: (value: string) => void;
  /** Texto da caixa enquanto nada foi escolhido. */
  placeholder?: string;
  disabled?: boolean;
  /** Motivo do bloqueio, mostrado no lugar da escolha. */
  disabledHint?: string;
  loading?: boolean;
  invalid?: boolean;
  /** Caixa destacada: um filtro fora do padrao, visivel de longe. */
  highlighted?: boolean;
  /**
   * Varias escolhas de uma vez: cada clique marca ou desmarca, e a lista
   * fica aberta. `resumo` e o texto da caixa (ex.: "3 líderes").
   */
  multiple?: { selected: string[]; onToggle: (value: string) => void; resumo: string };
  searchPlaceholder?: string;
  /** Abaixo deste total a busca nao aparece: a lista ja cabe na tela. */
  searchThreshold?: number;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

/** Espaco entre a caixa e a lista, e a margem minima ate a borda da tela. */
const GAP = 8;
const MARGEM = 8;
/** Altura maxima da lista aberta (busca incluida). */
const ALTURA_MAX = 360;
/** Abaixo disso, a lista abre para cima se la couber mais. */
const ALTURA_MIN = 220;

interface Posicao {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

/**
 * A lista suspensa do sistema: caixa arredondada, lista em cartao separado,
 * busca no topo quando a lista e longa, e a escolha atual em azul.
 *
 * A lista abre num portal, em posicao fixa sobre a tela: dentro de um modal
 * com rolagem ela nunca e cortada, e abre para cima quando nao cabe embaixo.
 *
 * Teclado: setas navegam, Enter escolhe, Esc fecha (sem fechar o modal por
 * baixo), e a busca aceita digitar direto. No toque, a busca nao puxa o
 * teclado sozinha — so quando a pessoa toca nela.
 */
export const Dropdown = forwardRef<HTMLButtonElement, DropdownProps>(function Dropdown(
  {
    id,
    value = '',
    options,
    onChange,
    placeholder = 'Selecione',
    disabled = false,
    disabledHint,
    loading = false,
    invalid = false,
    highlighted = false,
    multiple,
    searchPlaceholder = 'Pesquisar...',
    searchThreshold = 8,
    className,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    'aria-describedby': ariaDescribedby,
  },
  ref,
) {
  const autoId = useId();
  const baseId = id ?? `dropdown-${autoId.replace(/:/g, '')}`;
  const listId = `${baseId}-lista`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => triggerRef.current as HTMLButtonElement);

  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [ativo, setAtivo] = useState(-1);
  const [posicao, setPosicao] = useState<Posicao | null>(null);

  const bloqueado = disabled || loading;
  const estaMarcada = (option: DropdownOption) =>
    multiple ? multiple.selected.includes(option.value) : option.value === value;
  const escolhida = multiple
    ? { value: '', label: multiple.resumo }
    : (options.find((option) => option.value === value) ?? null);
  const comBusca = options.length >= searchThreshold;

  const filtradas = useMemo(
    () => options.filter((option) => matchesSearch(term, option.label)),
    [options, term],
  );

  const fechar = useCallback((devolverFoco: boolean) => {
    setOpen(false);
    setTerm('');
    if (devolverFoco) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  function abrir() {
    if (bloqueado) return;
    setTerm('');
    setAtivo(Math.max(0, options.findIndex(estaMarcada)));
    setOpen(true);
  }

  function escolher(option: DropdownOption | undefined) {
    if (!option || option.disabled) return;
    if (multiple) {
      multiple.onToggle(option.value);
      return;
    }
    if (option.value !== value) onChange?.(option.value);
    fechar(true);
  }

  // Onde a lista cabe: embaixo por padrao; em cima quando embaixo falta
  // espaco e em cima sobra mais. Refeito a cada rolagem e redimensionamento.
  const posicionar = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const caixa = trigger.getBoundingClientRect();
    const alturaTela = window.innerHeight;
    const larguraTela = window.innerWidth;

    const width = Math.min(Math.max(caixa.width, 200), larguraTela - MARGEM * 2);
    const left = Math.min(Math.max(caixa.left, MARGEM), larguraTela - width - MARGEM);

    const embaixo = alturaTela - caixa.bottom - GAP - MARGEM;
    const emCima = caixa.top - GAP - MARGEM;

    if (embaixo >= ALTURA_MIN || embaixo >= emCima) {
      setPosicao({ left, width, top: caixa.bottom + GAP, maxHeight: Math.min(ALTURA_MAX, embaixo) });
    } else {
      setPosicao({
        left,
        width,
        bottom: alturaTela - caixa.top + GAP,
        maxHeight: Math.min(ALTURA_MAX, emCima),
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    posicionar();
    window.addEventListener('resize', posicionar);
    window.addEventListener('scroll', posicionar, true);
    return () => {
      window.removeEventListener('resize', posicionar);
      window.removeEventListener('scroll', posicionar, true);
    };
  }, [open, posicionar]);

  // A lista so existe no DOM depois de posicionada: o foco e a rolagem
  // esperam por ela.
  const pronto = open && posicao !== null;

  useEffect(() => {
    if (!pronto) return;

    // Busca focada so com mouse: no celular, abrir a lista nao deve puxar o
    // teclado por cima dela.
    const ponteiroFino = window.matchMedia?.('(pointer: fine)').matches ?? true;
    const alvo = comBusca && ponteiroFino ? searchRef.current : listRef.current;
    alvo?.focus({ preventScroll: true });

    // A escolha atual aparece no meio da lista, e nao perdida la embaixo.
    const lista = listRef.current;
    const atual = lista?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (lista && atual) {
      lista.scrollTop = atual.offsetTop - lista.clientHeight / 2 + atual.offsetHeight / 2;
    }

    const foraDaLista = (event: PointerEvent) => {
      const alvoDoToque = event.target as Node;
      if (triggerRef.current?.contains(alvoDoToque) || panelRef.current?.contains(alvoDoToque)) return;
      fechar(false);
    };
    // Na janela, e na captura: roda antes do Esc do modal, que fica no
    // documento. Esc fecha a lista, e so a lista.
    const esc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      fechar(true);
    };

    document.addEventListener('pointerdown', foraDaLista, true);
    window.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('pointerdown', foraDaLista, true);
      window.removeEventListener('keydown', esc, true);
    };
    // So na abertura: a busca muda `filtradas`, e nao deve refocar nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto]);

  // A opcao em destaque acompanha as setas sem sair da area visivel.
  useEffect(() => {
    if (!open || ativo < 0) return;
    const lista = listRef.current;
    const item = lista?.querySelector<HTMLElement>(`[data-indice="${ativo}"]`);
    if (!lista || !item) return;
    if (item.offsetTop < lista.scrollTop) lista.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > lista.scrollTop + lista.clientHeight) {
      lista.scrollTop = item.offsetTop + item.offsetHeight - lista.clientHeight;
    }
  }, [ativo, open]);

  function mover(passo: 1 | -1) {
    if (filtradas.length === 0) return;
    let proximo = ativo;
    for (let volta = 0; volta < filtradas.length; volta += 1) {
      proximo = (proximo + passo + filtradas.length) % filtradas.length;
      if (!filtradas[proximo].disabled) break;
    }
    setAtivo(proximo);
  }

  function teclaNaLista(event: ReactKeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        mover(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        mover(-1);
        break;
      case 'Home':
        if (event.currentTarget === searchRef.current) return;
        event.preventDefault();
        setAtivo(0);
        break;
      case 'End':
        if (event.currentTarget === searchRef.current) return;
        event.preventDefault();
        setAtivo(filtradas.length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        escolher(filtradas[ativo]);
        break;
      case 'Tab':
        fechar(false);
        break;
    }
  }

  function teclaNaCaixa(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) abrir();
    }
  }

  const idDoItem = (indice: number) => `${baseId}-opcao-${indice}`;
  const textoDaCaixa = loading
    ? 'Carregando...'
    : disabled && disabledHint
      ? disabledHint
      : (escolhida?.label ?? placeholder);

  const painel =
    open && posicao && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            className={cn(
              'fixed z-[70] flex animate-scale-in flex-col overflow-hidden rounded-xl border border-line bg-surface p-2 shadow-overlay',
              posicao.bottom !== undefined ? 'origin-bottom' : 'origin-top',
            )}
            style={{
              left: posicao.left,
              width: posicao.width,
              top: posicao.top,
              bottom: posicao.bottom,
              maxHeight: posicao.maxHeight,
            }}
          >
            {comBusca ? (
              <div className="relative mb-1.5 shrink-0">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400"
                />
                <input
                  ref={searchRef}
                  type="search"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={ativo >= 0 ? idDoItem(ativo) : undefined}
                  aria-label={searchPlaceholder}
                  placeholder={searchPlaceholder}
                  value={term}
                  autoComplete="off"
                  onChange={(event) => {
                    setTerm(event.target.value);
                    setAtivo(0);
                  }}
                  onKeyDown={teclaNaLista}
                  className={cn(
                    'h-10 w-full rounded-lg border border-line-strong bg-surface pr-3 pl-9 text-base text-ink-900 sm:text-sm',
                    'placeholder:text-ink-400 transition-[border-color,box-shadow] duration-150',
                    'dropdown-foco focus:border-accent-500 focus:ring-4 focus:ring-accent-100 focus:outline-none',
                    '[&::-webkit-search-cancel-button]:hidden',
                  )}
                />
              </div>
            ) : null}

            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-multiselectable={multiple ? true : undefined}
              tabIndex={-1}
              aria-labelledby={ariaLabelledby}
              aria-label={ariaLabelledby ? undefined : ariaLabel}
              aria-activedescendant={!comBusca && ativo >= 0 ? idDoItem(ativo) : undefined}
              onKeyDown={teclaNaLista}
              className="dropdown-foco scrollbar-slim relative min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none"
            >
              {filtradas.length === 0 ? (
                <li className="px-3 py-3 text-sm text-ink-500">Nenhum resultado.</li>
              ) : (
                filtradas.map((option, indice) => {
                  const selecionada = estaMarcada(option);
                  return (
                    <li
                      key={`${option.value}-${indice}`}
                      id={idDoItem(indice)}
                      data-indice={indice}
                      role="option"
                      aria-selected={selecionada}
                      aria-disabled={option.disabled || undefined}
                      // mousedown sem padrao: o foco fica na busca/lista, e o
                      // clique nao "vaza" para o que estiver atras.
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseMove={() => ativo !== indice && setAtivo(indice)}
                      onClick={() => escolher(option)}
                      className={cn(
                        'flex min-h-11 cursor-pointer items-center rounded-lg px-3 py-2 text-sm font-semibold break-words transition-colors duration-100',
                        selecionada ? 'bg-accent-50 text-accent-600' : 'text-ink-900',
                        !selecionada && indice === ativo && 'bg-ink-50',
                        selecionada && indice === ativo && 'bg-accent-100',
                        option.disabled && 'cursor-not-allowed opacity-45',
                      )}
                    >
                      {multiple ? (
                        <span
                          aria-hidden="true"
                          className={cn(
                            'mr-2.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                            selecionada ? 'border-accent-600 bg-accent-600 text-white' : 'border-line-strong bg-surface',
                          )}
                        >
                          {selecionada ? <Check className="size-3" strokeWidth={3} /> : null}
                        </span>
                      ) : null}
                      <span className="min-w-0 flex-1">{option.label}</span>
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={cn('relative w-full min-w-0', className)}>
      <button
        ref={triggerRef}
        id={baseId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        disabled={bloqueado}
        onClick={() => (open ? fechar(false) : abrir())}
        onKeyDown={teclaNaCaixa}
        className={cn(
          'dropdown-foco flex min-h-11 w-full items-center gap-2 rounded-xl border bg-surface px-3.5 py-2 text-left',
          'transition-[border-color,box-shadow,background-color] duration-150 outline-none',
          'focus-visible:border-accent-500 focus-visible:ring-4 focus-visible:ring-accent-100',
          open
            ? 'border-accent-500 ring-4 ring-accent-100'
            : highlighted
              ? 'border-accent-500 bg-accent-50'
              : 'border-line-strong hover:border-ink-400',
          invalid && 'border-danger-600 ring-danger-600/15 focus-visible:border-danger-600 focus-visible:ring-danger-600/15',
          'disabled:cursor-not-allowed disabled:border-line disabled:bg-ink-50 disabled:text-ink-500',
        )}
      >
        {loading ? <Spinner className="size-4 shrink-0 text-ink-500" /> : null}
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[0.9375rem] font-semibold',
            escolhida && !loading ? 'text-ink-900' : 'font-medium text-ink-400',
            bloqueado && 'text-ink-500',
          )}
        >
          {textoDaCaixa}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-4 shrink-0 transition-transform duration-200',
            open ? 'rotate-180 text-accent-600' : 'text-ink-500',
          )}
        />
      </button>
      {painel}
    </div>
  );
});
