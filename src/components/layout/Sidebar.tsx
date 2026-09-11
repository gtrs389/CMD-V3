'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { appConfig } from '@/config/app.config';
import { cn } from '@/lib/utils/cn';
import { useSession } from './SessionProvider';
import { NAV_ITEMS, TEAM_NAV_ITEMS, isActive } from './navigation';

interface SidebarProps {
  /** Fecha o painel deslizante apos navegar (uso no celular). */
  onNavigate?: () => void;
}

/** Conteudo de navegacao. Reaproveitado pela barra flutuante e pelo menu deslizante. */
export function SidebarContent({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { user, can } = useSession();

  // O integrante da equipe tem um menu proprio: visao geral da propria
  // mobilizacao e o link pessoal de recrutamento.
  const source = user?.role === 'EQUIPE' ? TEAM_NAV_ITEMS : NAV_ITEMS;
  const items = source.filter((item) => can(item.permission));

  return (
    <div className="flex h-full min-h-0 flex-col text-white">
      <div className="shrink-0 px-4 pt-5 pb-4">
        <span
          aria-hidden="true"
          className="flex size-10 items-center justify-center rounded-control bg-white text-[0.6875rem] font-bold tracking-tight text-navy-900"
        >
          {appConfig.logo.kind === 'monogram' ? appConfig.logo.monogram : 'CMD'}
        </span>
        <p className="mt-3 text-[0.8125rem] leading-tight font-semibold text-white">
          Cadastro
          <br />
          Mobilização
          <br />
          Digital
        </p>
      </div>

      <nav
        aria-label="Navegação principal"
        className="safe-bottom min-h-0 flex-1 overflow-y-auto px-3 py-2 pb-4"
      >
        <ul className="space-y-1.5">
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
                    'flex min-h-10 items-center gap-2.5 rounded-control px-3 text-[0.8125rem] font-medium transition-colors',
                    active
                      ? 'bg-white text-navy-900 shadow-card'
                      : 'text-navy-200 hover:bg-navy-700 hover:text-white',
                  )}
                >
                  <Icon aria-hidden="true" className="size-[1.125rem] shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/**
 * Barra lateral flutuante, exibida a partir de `lg`.
 * Fica descolada das bordas, sobre o fundo azul-acinzentado da pagina.
 */
export function Sidebar() {
  return (
    <aside className="fixed inset-y-4 left-4 z-30 hidden w-[11.5rem] overflow-hidden rounded-card bg-navy-900 shadow-overlay lg:block">
      <SidebarContent />
    </aside>
  );
}
