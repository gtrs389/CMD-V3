'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { appConfig } from '@/config/app.config';
import { cn } from '@/lib/utils/cn';
import { homePathFor } from '@/lib/auth/constants';
import { LogoMark } from './Logo';
import { useSession } from './SessionProvider';
import { NAV_ITEMS, isActive } from './navigation';

interface SidebarProps {
  /** Fecha o painel deslizante apos navegar (uso no celular). */
  onNavigate?: () => void;
}

/** Conteudo de navegacao. Reaproveitado pela barra flutuante e pelo menu deslizante. */
export function SidebarContent({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { user, can } = useSession();

  const items = NAV_ITEMS.filter((item) => can(item.permission));

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden text-white">
      {/* Brilho do topo: a marca acende o azul-marinho em volta dela. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -left-10 size-48 rounded-full bg-accent-500/25 blur-3xl"
      />

      <div className="relative shrink-0 px-4 pt-5 pb-5">
        <Link
          href={homePathFor(user)}
          onClick={onNavigate}
          aria-label={`${appConfig.name}: página inicial`}
          className="group flex items-center gap-2.5 rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-400"
        >
          <LogoMark
            animated
            className="size-10 drop-shadow-[0_6px_14px_rgba(37,99,235,0.45)] transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3"
          />
          <span className="min-w-0 leading-none">
            <span className="flex items-center gap-1 text-lg font-extrabold tracking-tight">
              {appConfig.shortName}
              <span aria-hidden="true" className="size-1.5 rounded-full bg-gold-400" />
            </span>
            <span className="mt-1 block truncate text-[0.625rem] font-medium tracking-wide text-navy-300">
              {appConfig.wordmarkTagline}
            </span>
          </span>
        </Link>
      </div>

      <p className="relative px-6 pb-2 text-[0.625rem] font-semibold tracking-[0.16em] text-navy-300/80 uppercase">
        Menu
      </p>

      <nav
        aria-label="Navegação principal"
        className="safe-bottom relative min-h-0 flex-1 overflow-y-auto px-3 pb-4"
      >
        <ul className="space-y-1">
          {items.map((item, index) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href} className="cmd-cascata" style={{ '--cmd-atraso': `${80 + index * 60}ms` } as React.CSSProperties}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex min-h-10 items-center gap-2.5 rounded-control px-3 text-[0.8125rem] font-medium transition-all duration-200',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400',
                    active
                      ? 'bg-white text-navy-900 shadow-[0_8px_20px_-8px_rgba(37,99,235,0.6)]'
                      : 'text-navy-200 hover:translate-x-0.5 hover:bg-white/8 hover:text-white',
                  )}
                >
                  {/* Marcador da pagina atual. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute top-1/2 -left-3 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gold-400 transition-all duration-300',
                      active ? 'opacity-100' : 'scale-y-0 opacity-0',
                    )}
                  />
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      'size-[1.125rem] shrink-0 transition-colors',
                      active ? 'text-accent-600' : 'text-navy-300 group-hover:text-white',
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="relative shrink-0 border-t border-white/10 px-5 py-3">
        <p className="flex items-center gap-2 text-[0.625rem] text-navy-300">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success-400 opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-success-400" />
          </span>
          Sistema online
        </p>
      </div>
    </div>
  );
}

/**
 * Barra lateral flutuante, exibida a partir de `lg`.
 * Fica descolada das bordas, sobre o fundo azul-acinzentado da pagina.
 */
export function Sidebar() {
  return (
    <aside className="fixed inset-y-4 left-4 z-30 hidden w-[13rem] overflow-hidden rounded-card bg-gradient-to-b from-navy-900 via-navy-900 to-navy-800 shadow-overlay ring-1 ring-white/5 lg:block">
      <SidebarContent />
    </aside>
  );
}
