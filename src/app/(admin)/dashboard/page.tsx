import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/auth/server';
import { DashboardView } from '@/components/dashboard/DashboardView';

export const metadata: Metadata = {
  title: 'Painel',
};

/** Visao geral de toda a operacao: exclusiva do ADMIN. */
export default async function DashboardPage() {
  await requireAdminPage();
  return <DashboardView />;
}
