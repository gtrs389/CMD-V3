'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { useSession } from './SessionProvider';
import { Logo } from './Logo';
import { NAV_ITEMS, isActive } from './navigation';
import { UserMenu } from './UserMenu';

interface SidebarProps {
  /** Fecha o painel deslizante apos navegar (uso no celular). */
  onNavigate?: () => void;
}

/** Conteudo de navegacao. Reaproveitado pela barra fixa e pelo menu deslizante. */
export function SidebarContent({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { can } = useSession();

  const items = NAV_ITEMS.filter((item) => can(item.permission));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-16 shrink-0 items-center border-b border-line px-4">
        <Logo />
      </div>

      <nav aria-label="Navegacao principal" className="min-h-0 flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors',
                    active
                      ? 'bg-brand-50 text-brand-800'
                      : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900',
                  )}
                >
                  <Icon aria-hidden="true" className="size-5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="safe-bottom shrink-0 border-t border-line p-3">
        <UserMenu />
      </div>
    </div>
  );
}

/** Barra lateral fixa, exibida a partir de `lg`. */
export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-surface lg:block">
      <SidebarContent />
    </aside>
  );
}
