import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { Inter } from 'next/font/google';
import { appConfig } from '@/config/app.config';
import { ToastProvider } from '@/components/ui/Toast';
import { AccessShield } from '@/components/security/AccessShield';
import { RotaDaMoldura } from '@/components/layout/RotaDaMoldura';
import { SCRIPT_DA_MOLDURA } from '@/lib/domain/endereco-limpo';
import { SCRIPT_DO_MENU } from '@/components/layout/menu-recolhido';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-app-sans',
});

export const metadata: Metadata = {
  title: {
    default: `${appConfig.name} (${appConfig.shortName})`,
    template: `%s | ${appConfig.shortName}`,
  },
  description: appConfig.description,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Garante o respeito as areas seguras do iPhone.
  viewportFit: 'cover',
  themeColor: '#DBE2E9',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `data-menu` (menu lateral recolhido) vem do script abaixo, antes da hidratacao.
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* O menu lateral abre como a pessoa deixou (recolhido ou nao), sem piscar. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DO_MENU }} />
        {/* Endereco limpo: a barra mostra so o dominio, e o painel roda numa
            moldura em `/`. Roda antes de desenhar, para a tela nao piscar
            no caminho (ver `endereco-limpo.ts`). */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DA_MOLDURA }} />
      </head>
      <body className="antialiased">
        <ToastProvider>{children}</ToastProvider>
        {/* Botao direito e F12: a tranca vale no sistema inteiro, painel e
            links de cadastro. Desenha por cima, nunca desmonta a pagina. */}
        <AccessShield />
        <Suspense fallback={null}>
          <RotaDaMoldura />
        </Suspense>
      </body>
    </html>
  );
}
