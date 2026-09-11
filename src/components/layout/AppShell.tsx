import type { ReactNode } from 'react';
import { Logo } from './Logo';
import { MobileNav } from './MobileNav';
import { Sidebar } from './Sidebar';
import { UserMenu } from './UserMenu';

interface AppShellProps {
  children: ReactNode;
  /**
   * Barra lateral de navegacao.
   *
   * O time enxerga apenas o proprio cadastro: sem rotas para navegar,
   * a barra some e fica so o cabecalho com a marca e o menu de usuario.
   */
  withSidebar?: boolean;
}

/**
 * Estrutura das telas autenticadas.
 * Barra lateral fixa no desktop, menu deslizante no celular.
 */
export function AppShell({ children, withSidebar = true }: AppShellProps) {
  if (!withSidebar) {
    return (
      <div className="min-h-dvh bg-canvas">
        <header className="safe-top sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
          <div className="safe-x mx-auto flex h-14 w-full max-w-[76rem] items-center gap-2 px-4 sm:px-6">
            <Logo size="sm" />
            <span className="min-w-0 flex-1" />
            <UserMenu />
          </div>
        </header>

        <main className="safe-x mx-auto w-full max-w-[76rem] px-4 py-5 sm:px-6">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <Sidebar />
      <MobileNav />

      {/* A barra flutuante ocupa 11.5rem a partir de 1rem da borda. */}
      <div className="lg:pl-[13.5rem]">
        <div className="safe-x mx-auto w-full max-w-[76rem] px-4 py-5 sm:px-6 lg:pr-4 lg:pl-0">
          {/* No celular o botao de usuario vive no cabecalho fixo. */}
          <div className="mb-3 hidden justify-end lg:flex">
            <UserMenu />
          </div>

          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
