import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { appConfig } from '@/config/app.config';
import { ToastProvider } from '@/components/ui/Toast';
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
    <html lang="pt-BR" className={inter.variable}>
      <body className="antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
