'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { appConfig } from '@/config/app.config';
import { cn } from '@/lib/utils/cn';
import { homePathFor } from '@/lib/auth/constants';
import { LogoMark } from './Logo';
import { useSession } from './SessionProvider';
import { NAV_ITEMS, isActive } from './navigation';
import { alternarMenu } from './menu-recolhido';

interface SidebarProps {
  /** Fecha o painel deslizante apos navegar (uso no celular). */
  onNavigate?: () => void;
  /** Na barra do computador: o botao de recolher aparece no rodape. */
  recolhivel?: boolean;
}

/** Conteudo de navegacao. Reaproveitado pela barra flutuante e pelo menu deslizante. */
export function SidebarContent({ onNavigate, recolhivel = false }: SidebarProps) {
  const pathname = usePathname();
  const { user, can } = useSession();

  const items = NAV_ITEMS.filter((item) => can(item.permission));

  return (
    <div className="relative flex h-full min-h-0 flex-col text-white">
      {/* Brilho do topo: a marca acende o azul-marinho em volta dela. Fica
          numa camada recortada propria: recolhido, os rotulos dos icones
          saem para fora da barra. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <span className="absolute -top-16 -left-10 size-48 rounded-full bg-accent-500/25 blur-3xl" />
      </span>

      <div className="relative shrink-0 px-4 pt-5 pb-5 recolhido:px-0 recolhido:pt-4">
        <Link
          href={homePathFor(user)}
          onClick={onNavigate}
          aria-label={`${appConfig.name}: página inicial`}
          className="group flex items-center gap-2.5 rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-400 recolhido:justify-center"
        >
          <LogoMark
            animated
            className="size-10 drop-shadow-[0_6px_14px_rgba(37,99,235,0.45)] transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3"
          />
          <span className="min-w-0 leading-none recolhido:hidden">
            <span className="flex items-center gap-1 text-lg font-extrabold tracking-tight">
              {appConfig.shortName}
              <span aria-hidden="true" className="size-1.5 rounded-full bg-gold-400" />
            </span>
            <span className="mt-1 block wrap-break-word text-[0.625rem] font-medium tracking-wide text-navy-300">
              {appConfig.wordmarkTagline}
            </span>
          </span>
        </Link>
      </div>

      <p className="relative px-6 pb-2 text-[0.625rem] font-semibold tracking-[0.16em] text-navy-300/80 uppercase recolhido:px-0 recolhido:text-center">
        <span className="recolhido:hidden">Menu</span>
        <span aria-hidden="true" className="mx-auto hidden h-px w-6 bg-white/15 recolhido:block" />
      </p>

      <nav
        aria-label="Navegação principal"
        className="safe-bottom relative min-h-0 flex-1 overflow-y-auto px-3 pb-4 recolhido:overflow-visible recolhido:px-2.5"
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
                  aria-label={item.label}
                  className={cn(
                    'group relative flex min-h-10 items-center gap-2.5 rounded-control px-3 text-[0.8125rem] font-medium transition-all duration-200',
                    'recolhido:justify-center recolhido:px-0 recolhido:hover:translate-x-0',
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
                  <span className="wrap-break-word recolhido:hidden">{item.label}</span>
                  {/* Recolhido: o nome sai ao lado do icone quando o mouse passa. */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-full z-50 ml-3 hidden -translate-x-1 -translate-y-1/2 rounded-control bg-navy-900 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white opacity-0 shadow-overlay ring-1 ring-white/10 transition-all duration-200 recolhido:block recolhido:group-hover:translate-x-0 recolhido:group-hover:opacity-100 recolhido:group-focus-visible:translate-x-0 recolhido:group-focus-visible:opacity-100"
                  >
                    {item.label}
                    <span className="absolute top-1/2 -left-1 size-2 -translate-y-1/2 rotate-45 bg-navy-900" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="relative shrink-0 space-y-2 border-t border-white/10 px-3 py-3 recolhido:px-2.5">
        {recolhivel ? <BotaoRecolher /> : null}
        <p className="flex items-center gap-2 px-2 text-[0.625rem] text-navy-300 recolhido:justify-center recolhido:px-0" title="Sistema online">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success-400 opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-success-400" />
          </span>
          <span className="recolhido:hidden">Sistema online</span>
        </p>
      </div>
    </div>
  );
}

/**
 * Recolher e abrir o menu. O icone e o texto trocam pelo CSS (o estado mora
 * no <html>), e Ctrl+B (⌘B no Mac) faz o mesmo de qualquer lugar.
 */
function BotaoRecolher() {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'b' || e.altKey || e.shiftKey) return;
      const alvo = e.target as HTMLElement | null;
      // Escrevendo num campo, o atalho e do campo (negrito, por exemplo).
      if (alvo && (alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName))) return;
      e.preventDefault();
      alternarMenu();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  return (
    <button
      type="button"
      onClick={() => alternarMenu()}
      title="Recolher ou abrir o menu (Ctrl+B)"
      className="group relative flex min-h-10 w-full items-center gap-2.5 rounded-control px-3 text-[0.8125rem] font-medium text-navy-200 ring-1 ring-white/10 transition-all duration-200 hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400 recolhido:justify-center recolhido:px-0"
    >
      <ChevronsLeft aria-hidden="true" className="size-[1.125rem] shrink-0 transition-transform group-hover:-translate-x-0.5 recolhido:hidden" />
      <ChevronsRight aria-hidden="true" className="hidden size-[1.125rem] shrink-0 transition-transform group-hover:translate-x-0.5 recolhido:block" />
      <span className="whitespace-nowrap recolhido:hidden">Recolher menu</span>
      <kbd className="ml-auto rounded border border-white/15 px-1 font-sans text-[0.5625rem] whitespace-nowrap text-navy-300 recolhido:hidden">Ctrl B</kbd>
      <span className="sr-only">Recolher ou abrir o menu</span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-full z-50 ml-3 hidden -translate-x-1 -translate-y-1/2 rounded-control bg-navy-900 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white opacity-0 shadow-overlay ring-1 ring-white/10 transition-all duration-200 recolhido:block recolhido:group-hover:translate-x-0 recolhido:group-hover:opacity-100"
      >
        Abrir menu
      </span>
    </button>
  );
}

/**
 * Barra lateral flutuante, exibida a partir de `lg`.
 * Fica descolada das bordas, sobre o fundo azul-acinzentado da pagina.
 * Recolhida (`data-menu` no <html>), vira uma coluna so de icones.
 */
export function Sidebar() {
  return (
    <aside
      data-lateral
      className="fixed inset-y-4 left-4 z-30 hidden w-[13rem] rounded-card bg-gradient-to-b from-navy-900 via-navy-900 to-navy-800 shadow-overlay ring-1 ring-white/5 transition-[width] duration-300 ease-out lg:block recolhido:w-[4.5rem]"
    >
      <SidebarContent recolhivel />
    </aside>
  );
}
