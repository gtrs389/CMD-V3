'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { IconButton } from './IconButton';

export interface MenuAction {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}

interface MenuProps {
  actions: MenuAction[];
  label?: string;
  align?: 'left' | 'right';
}

/** Espaco entre o botao e a lista, e a margem minima ate a borda da tela. */
const GAP = 6;
const MARGEM = 8;
const LARGURA = 208;

interface Posicao {
  left: number;
  top?: number;
  bottom?: number;
  origem: string;
}

/**
 * Menu de acoes acionado por clique/toque.
 * Nunca depende de hover, para funcionar em telas sensiveis ao toque.
 *
 * A lista abre num PORTAL, em posicao fixa sobre a tela. Dentro de um cartao
 * com `overflow-hidden` (o cartao do time, por exemplo) a lista absoluta era
 * cortada pela borda do proprio cartao: o botao abria um menu invisivel. No
 * portal ela nunca e cortada, e abre para cima quando nao cabe embaixo.
 */
export function Menu({ actions, label = 'Mais ações', align = 'right' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [posicao, setPosicao] = useState<Posicao | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const fechar = useCallback((devolverFoco: boolean) => {
    setOpen(false);
    setPosicao(null);
    if (devolverFoco) triggerRef.current?.querySelector('button')?.focus({ preventScroll: true });
  }, []);

  const posicionar = useCallback(() => {
    const botao = triggerRef.current?.getBoundingClientRect();
    if (!botao) return;
    const altura = panelRef.current?.offsetHeight ?? actions.length * 44 + 8;
    const largura = panelRef.current?.offsetWidth ?? LARGURA;
    const abaixo = window.innerHeight - botao.bottom - GAP - MARGEM;
    const paraCima = abaixo < altura && botao.top > abaixo;
    const desejado = align === 'right' ? botao.right - largura : botao.left;
    const left = Math.min(Math.max(MARGEM, desejado), window.innerWidth - largura - MARGEM);
    setPosicao(
      paraCima
        ? {
            left,
            bottom: window.innerHeight - botao.top + GAP,
            origem: align === 'right' ? 'bottom right' : 'bottom left',
          }
        : { left, top: botao.bottom + GAP, origem: align === 'right' ? 'top right' : 'top left' },
    );
  }, [actions.length, align]);

  // Mede depois de pintar a lista uma vez: so entao a altura real existe.
  useLayoutEffect(() => {
    if (open) posicionar();
  }, [open, posicionar]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const alvo = event.target as Node;
      if (triggerRef.current?.contains(alvo) || panelRef.current?.contains(alvo)) return;
      fechar(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        fechar(true);
      }
    };
    // Rolar a pagina mudaria o lugar do botao: a lista acompanha.
    const onMove = () => posicionar();

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, fechar, posicionar]);

  // Ao abrir, o foco vai para o primeiro item: setas e Enter ja funcionam.
  useEffect(() => {
    if (!open || !posicao) return;
    panelRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [open, posicao]);

  function onPanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(event.key)) return;
    if (event.key === 'Tab') {
      fechar(false);
      return;
    }
    event.preventDefault();
    const itens = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    if (itens.length === 0) return;
    const atual = itens.indexOf(document.activeElement as HTMLButtonElement);
    const proximo =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? itens.length - 1
          : event.key === 'ArrowDown'
            ? (atual + 1) % itens.length
            : (atual - 1 + itens.length) % itens.length;
    itens[proximo]?.focus();
  }

  return (
    <div ref={triggerRef} className="relative">
      <IconButton
        label={label}
        icon={<MoreVertical className="size-5" />}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? fechar(false) : setOpen(true))}
      />

      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={menuId}
              role="menu"
              aria-label={label}
              onKeyDown={onPanelKeyDown}
              // O clique num item nao pode "vazar" para o cartao por baixo
              // (os eventos do React atravessam o portal ate os ancestrais).
              onClick={(event) => event.stopPropagation()}
              style={{
                position: 'fixed',
                left: posicao?.left ?? -9999,
                top: posicao?.top,
                bottom: posicao?.bottom,
                transformOrigin: posicao?.origem,
                visibility: posicao ? 'visible' : 'hidden',
              }}
              className="z-[1300] min-w-52 animate-scale-in overflow-hidden rounded-control border border-line bg-surface py-1 shadow-overlay"
            >
              {actions.map((action) => (
                <button
                  key={action.id}
                  role="menuitem"
                  type="button"
                  disabled={action.disabled}
                  onClick={() => {
                    fechar(false);
                    action.onSelect();
                  }}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-sm transition-colors focus:outline-none',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    action.tone === 'danger'
                      ? 'text-danger-600 hover:bg-danger-50 focus-visible:bg-danger-50'
                      : 'text-ink-700 hover:bg-ink-100 focus-visible:bg-ink-100',
                  )}
                >
                  {action.icon}
                  <span className="wrap-break-word">{action.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
