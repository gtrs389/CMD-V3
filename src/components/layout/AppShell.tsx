import type { ReactNode } from 'react';
import { MobileNav } from './MobileNav';
import { Sidebar } from './Sidebar';

/**
 * Estrutura das telas administrativas.
 * Barra lateral fixa no desktop, menu deslizante no celular.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface-muted">
      <Sidebar />
      <MobileNav />

      <div className="lg:pl-64">
        <main className="safe-x mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
