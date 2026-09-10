'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu as MenuIcon, X } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import { Logo } from './Logo';
import { SidebarContent } from './Sidebar';

/**
 * Navegacao compacta do celular: cabecalho fixo com menu lateral deslizante.
 * Fecha automaticamente ao trocar de rota.
 */
export function MobileNav() {
  const pathname = usePathname();
  // Guarda a rota em que o menu foi aberto: ao navegar, ele fecha sozinho.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const open = openedFor === pathname;

  const close = () => setOpenedFor(null);

  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenedFor(null);
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <header className="safe-top sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center gap-2 px-3">
          <IconButton
            label="Abrir menu"
            icon={<MenuIcon className="size-5" />}
            aria-expanded={open}
            onClick={() => setOpenedFor(pathname)}
            className="text-ink-900"
          />
          <Logo withName={false} size="sm" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900">
            Central de mobilização
          </span>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-ink-900/45"
            onClick={close}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navegação"
            className="safe-top relative h-full w-[min(16rem,85vw)] animate-slide-right bg-navy-900 shadow-overlay"
          >
            <IconButton
              label="Fechar menu"
              icon={<X className="size-5" />}
              onClick={close}
              className="absolute top-3 right-2 z-10 text-white"
            />
            <SidebarContent onNavigate={close} />
          </div>
        </div>
      ) : null}
    </>
  );
}
