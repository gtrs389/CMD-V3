import type { ReactNode } from 'react';
import { InspectionBanner } from './InspectionBanner';
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
      <div className="relative min-h-dvh overflow-clip bg-canvas">
        <header className="safe-top sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
          <div className="safe-x mx-auto flex h-14 w-full max-w-[76rem] items-center gap-2 px-4 sm:px-6">
            <Logo size="sm" />
            <span className="min-w-0 flex-1" />
            <UserMenu />
          </div>
        </header>

        <main className="safe-x mx-auto w-full max-w-[76rem] px-4 py-5 sm:px-6">{children}</main>

        {/* Painel aberto pelo ADMIN geral: a faixa avisa de quem ele e. */}
        <InspectionBanner />
      </div>
    );
  }

  /*
   * `relative overflow-clip`: a pagina termina onde o conteudo termina.
   * Nenhum elemento solto — um brilho desfocado, uma lista posicionada, um
   * enfeite girando — consegue esticar a rolagem alem do fim e deixar um
   * vao cinza "sem fim" embaixo. `clip` (e nao `hidden`) nao cria area de
   * rolagem propria: o cabecalho e as barras grudadas (sticky) continuam
   * funcionando, e o que e `fixed` (menu lateral, janelas) nao e cortado.
   */
  return (
    <div className="relative min-h-dvh overflow-clip bg-canvas">
      <Sidebar />
      <MobileNav />

      {/* A barra flutuante ocupa 13rem a partir de 1rem da borda (4,5rem recolhida). */}
      <div className="transition-[padding] duration-300 ease-out lg:pl-[15rem] lg:menu-recolhido:pl-[6.5rem]">
        <div className="safe-x mx-auto w-full max-w-[76rem] px-4 py-5 sm:px-6 lg:pr-4 lg:pl-0 lg:menu-recolhido:max-w-[84rem]">
          {/* No celular o botao de usuario vive no cabecalho fixo. */}
          <div className="mb-3 hidden justify-end lg:flex">
            <UserMenu />
          </div>

          <main>{children}</main>
        </div>
      </div>

      <InspectionBanner />
    </div>
  );
}
