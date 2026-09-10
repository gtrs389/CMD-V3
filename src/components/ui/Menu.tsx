'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
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

/**
 * Menu de acoes acionado por clique/toque.
 * Nunca depende de hover, para funcionar em telas sensiveis ao toque.
 */
export function Menu({ actions, label = 'Mais ações', align = 'right' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <IconButton
        label={label}
        icon={<MoreVertical className="size-5" />}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      />

      {open ? (
        <div
          id={menuId}
          role="menu"
          className={cn(
            'absolute z-30 mt-1 min-w-52 animate-scale-in overflow-hidden rounded-control border border-line bg-surface py-1 shadow-overlay',
            align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
          )}
        >
          {actions.map((action) => (
            <button
              key={action.id}
              role="menuitem"
              type="button"
              disabled={action.disabled}
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
              className={cn(
                'flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-sm transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-50',
                action.tone === 'danger'
                  ? 'text-danger-600 hover:bg-danger-50'
                  : 'text-ink-700 hover:bg-ink-100',
              )}
            >
              {action.icon}
              <span className="truncate">{action.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
