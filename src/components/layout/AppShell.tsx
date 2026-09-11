import type { ReactNode } from 'react';
import { MobileNav } from './MobileNav';
import { Sidebar } from './Sidebar';
import { UserMenu } from './UserMenu';

/**
 * Estrutura das telas administrativas.
 * Barra lateral fixa no desktop, menu deslizante no celular.
 */
export function AppShell({ children }: { children: ReactNode }) {
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
