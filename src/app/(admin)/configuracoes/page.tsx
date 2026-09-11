import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/auth/server';
import { SettingsView } from '@/components/settings/SettingsView';

export const metadata: Metadata = {
  title: 'Configurações',
};

/** Configuracoes do sistema: exclusivas do ADMIN. */
export default async function SettingsPage() {
  await requireAdminPage();
  return <SettingsView />;
}
